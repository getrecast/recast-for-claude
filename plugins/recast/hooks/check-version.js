"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = "getrecast/recast-for-claude";
const RELEASES_URL = "https://api.github.com/repos/getrecast/recast-for-claude/releases/latest";
const CHANGELOG_URL = "https://github.com/getrecast/recast-for-claude/blob/main/CHANGELOG.md";
const DAY_MS = 86400000; // 24 hours
const FETCH_TIMEOUT_MS = 3000;
const USER_AGENT = "recast-plugin-update-check";

function parseVersion(s) {
  const core = String(s).trim().replace(/^v/, "").split(/[-+]/)[0];
  return core.split(".").map((n) => parseInt(n, 10) || 0);
}

function verGt(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonSafe(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj));
  } catch {
    /* fail silent */
  }
}

function resolveConfigDir(env, homedir) {
  const c = env.CLAUDE_CONFIG_DIR;
  if (typeof c === "string" && c.trim()) return c;
  if (!homedir) return ""; // unresolved home -> empty config dir, never throw
  return path.join(homedir, ".claude");
}

function readInstalledVersion(pluginRoot, readJson) {
  if (!pluginRoot) return null;
  const pj = readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
  return pj && typeof pj.version === "string" ? pj.version : null;
}

function truthyEnv(v) {
  return typeof v === "string" && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

function findMarketplaceByRepo(obj, repo) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.source && obj.source.repo === repo) return obj;
  for (const k of Object.keys(obj)) {
    const found = findMarketplaceByRepo(obj[k], repo);
    if (found) return found;
  }
  return null;
}

function isAutoUpdateEnabled(env, configDir, readJson) {
  // Documented, reliable global signal: auto-update off unless FORCE re-enables plugins.
  if (truthyEnv(env.DISABLE_AUTOUPDATER) && !truthyEnv(env.FORCE_AUTOUPDATE_PLUGINS)) return false;
  // Best-effort, undocumented per-marketplace flag; any uncertainty -> false (proceed to nudge).
  if (!configDir) return false;
  const files = [
    path.join(configDir, "plugins", "known_marketplaces.json"),
    path.join(configDir, "settings.json"),
  ];
  for (const p of files) {
    const entry = findMarketplaceByRepo(readJson(p), REPO);
    if (entry && entry.autoUpdate === true) return true;
  }
  return false;
}

function loadState(dataDir, readJson) {
  if (!dataDir) return { last_check: 0, latest: null, disclosed: false };
  const s = readJson(path.join(dataDir, "update-check.json")) || {};
  return {
    last_check: typeof s.last_check === "number" ? s.last_check : 0,
    latest: typeof s.latest === "string" ? s.latest : null,
    disclosed: s.disclosed === true,
  };
}

function saveState(dataDir, writeJson, state) {
  if (!dataDir) return;
  writeJson(path.join(dataDir, "update-check.json"), state);
}

const DISCLOSURE_MSG = [
  "🟠 Recast plugin — staying up to date",
  "This plugin checks GitHub about once a day for a newer version of the Recast skills, so you aren't running outdated guidance. It only reads a public file and sends nothing about you. Your choices:",
  "  • Do nothing — you'll get a short note here whenever an update is available, and you update when it suits you.",
  "  • Get updates automatically — run /plugin, open \"Marketplaces\", select \"recast\", and choose \"Enable auto-update\". After that you'll always be current and these notices stop.",
  "  • Turn these checks off — see \"Updating\" in the plugin README: https://github.com/getrecast/recast-for-claude/tree/main/plugins/recast#updating",
].join("\n");

function nudgeLine(latest, installed) {
  return [
    `🟠 Recast plugin update available: v${latest} (you're on v${installed}).`,
    "  • Update — run this in a terminal, then /reload-plugins in Claude Code:",
    "      claude plugin update recast@recast",
    "  • Prefer automatic updates? /plugin → \"Marketplaces\" → \"recast\" → \"Enable auto-update\".",
  ].join("\n");
}

function compose({ firstRun, installed, latest }) {
  const parts = [];
  if (firstRun) parts.push(DISCLOSURE_MSG);
  if (latest && installed && verGt(latest, installed)) parts.push(nudgeLine(latest, installed));
  // Wrap with a leading and trailing blank line (one blank line between the two blocks when both
  // appear) so it renders clearly below Claude Code's "SessionStart:startup says:" prefix.
  return parts.length ? "\n" + parts.join("\n\n") + "\n" : null;
}

async function fetchLatest(fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(RELEASES_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    if (!res || !res.ok) return null;
    const body = await res.json();
    const tag = body && typeof body.tag_name === "string" ? body.tag_name : null;
    return tag ? tag.replace(/^v/, "") : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function run(deps) {
  const {
    env,
    homedir,
    pluginRoot,
    dataDir,
    readJson = readJsonSafe,
    writeJson = writeJsonSafe,
    fetchImpl,
    now,
    timeoutMs = FETCH_TIMEOUT_MS,
  } = deps;

  // 1. Opt-out (before any file read or network call).
  if (env.CLAUDE_PLUGIN_OPTION_UPDATE_CHECK === "false") return { output: null };

  // 2. Auto-update already handled by Claude Code?
  const configDir = resolveConfigDir(env, homedir);
  if (isAutoUpdateEnabled(env, configDir, readJson)) return { output: null };

  // 2b. Resolve a persistable state directory. CLAUDE_PLUGIN_DATA is primary; if it is absent we
  // fall back to a stable path under the config dir. Without ANY persistable path we cannot honor
  // the once-per-24h throttle, so we stay silent rather than fetch + nudge on every session.
  const dataPath = dataDir || (configDir ? path.join(configDir, "plugins", "recast-nudge-data") : "");
  if (!dataPath) return { output: null };

  // 3. State + first-run.
  const state = loadState(dataPath, readJson);
  const firstRun = !state.disclosed;

  // 4. Throttle: <=1 network call / notice per 24h.
  const t = now();
  if (!firstRun && t - state.last_check < DAY_MS) return { output: null };

  // 5. Installed version.
  const installed = readInstalledVersion(pluginRoot, readJson);
  if (!installed) return { output: null };

  // 6. Latest (fail-silent -> null).
  const latest = await fetchLatest(fetchImpl, timeoutMs);

  // 7. Persist (record the attempt regardless of fetch outcome).
  const newState = {
    last_check: t,
    latest: latest || state.latest,
    disclosed: firstRun ? true : state.disclosed,
  };
  saveState(dataPath, writeJson, newState);

  // 8. Compose output.
  const output = compose({ firstRun, installed, latest });
  return { output, state: newState };
}

if (require.main === module) {
  // Resolve home defensively: os.homedir() can throw on exotic setups, and this runs synchronously
  // OUTSIDE the promise chain's .catch — so a throw here would escape the fail-silent guarantee.
  let homedir = "";
  try {
    homedir = os.homedir();
  } catch {
    /* leave "" -> resolveConfigDir degrades safely */
  }
  run({
    env: process.env,
    homedir,
    pluginRoot: process.env.CLAUDE_PLUGIN_ROOT,
    dataDir: process.env.CLAUDE_PLUGIN_DATA,
    fetchImpl: (url, opts) => fetch(url, opts),
    now: () => Date.now(),
  })
    .then((r) => {
      if (r && r.output) {
        // Exit only after the write drains — process.exit() can truncate a piped stdout.
        process.stdout.write(JSON.stringify({ systemMessage: r.output }), () => process.exit(0));
      } else {
        process.exit(0);
      }
    })
    .catch(() => process.exit(0));
}

module.exports = {
  REPO, RELEASES_URL, CHANGELOG_URL, DAY_MS, FETCH_TIMEOUT_MS, USER_AGENT,
  parseVersion, verGt,
  readJsonSafe, writeJsonSafe, resolveConfigDir, readInstalledVersion,
  truthyEnv, findMarketplaceByRepo, isAutoUpdateEnabled,
  loadState, saveState, compose, nudgeLine, DISCLOSURE_MSG, fetchLatest, run,
};
