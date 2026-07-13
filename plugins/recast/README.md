# Recast Plugin

Recast for Claude Code — MCP tools backed by the hosted Recast MCP server, plus skills for the public Reporter, Forecaster, and Optimizer APIs.

## Prerequisites

- A Recast account (accounts are provisioned by Recast — contact your Recast representative if you don't have one)
- Claude Code v2+ (remote MCP + plugin support)
- *(Only for the API skills)* a Personal Access Token (PAT) — in the Recast app, open the account menu (the nav-bar dropdown labeled with your email) and click "Generate API Token" (shown once — copy it immediately; regenerating revokes the previous token). The MCP tools don't need this; see step 2.

## Setup

1. Add the Recast marketplace and install the plugin:

   ```bash
   claude plugin marketplace add getrecast/recast-for-claude
   claude plugin install recast@recast
   ```

2. *(Only if you'll use the API skills)* set your PAT in `~/.claude/settings.json` (create the file if it doesn't exist) under the top-level `env` key, merging with any existing contents. The MCP tools authenticate via OAuth and need no token here:

   ```json
   {
     "env": {
       "RECAST_PAT": "<your-pat>"
     }
   }
   ```

   This reaches every way Claude Code runs. A shell-profile `export RECAST_PAT=<your-pat>` works too, but only for sessions launched from a terminal.

3. Restart Claude Code (fully quit the desktop app if you use it). On first use of a Recast MCP tool, a browser window opens for OAuth sign-in with your Recast account — complete it once.

## Smoke test

1. Run `/mcp` — the `recast` server should show as connected, with its tools listed.
2. Ask Claude something like "list my Recast models" (or call any Recast tool) — it should return data for your account.
3. Run `/recast:reporter-api` — the Reporter API skill should load and ask what you want to analyze.

## Skills

Invoked under the `recast:` namespace, or triggered automatically when Claude detects a matching request.

| Skill | Command | What it does |
|-------|---------|--------------|
| Getting Started | `/recast:getting-started` | Walks through PAT generation, `RECAST_PAT` setup in settings.json, OAuth sign-in, and auth troubleshooting |
| Reporter API | `/recast:reporter-api` | Identifies the right report type from what you want to analyze, prompts for required inputs, generates code to create/poll/download CSV results |
| Forecaster API | `/recast:forecaster-api` | Translates forecasting goals into Forecast / Spend Forecast API requests — predicts the outcomes of a known budget |
| Optimizer API | `/recast:optimizer-api` | Translates optimization goals into Optimizer API requests (objectives, constraints, channel budgets, multi-KPI) — prescribes the budget to hit a goal |

## MCP server

The plugin connects to the hosted Recast MCP server at `https://mcp.getrecast.com/mcp`. Authentication is OAuth via your Recast account, handled by Claude Code — on first use of a Recast tool a browser window opens to sign in. The MCP server needs **no PAT or token**; `RECAST_PAT` is only used by the API skills (Reporter/Forecaster/Optimizer) for the code they generate.

## Troubleshooting

- **MCP tools fail with auth/401 / "unauthorized":** the OAuth session expired or was never established (this is *not* a PAT problem). Reconnect the `recast` MCP server in your client to re-run the sign-in, then restart Claude Code.
- **Claude asks for a `RECAST_PAT` while you're using the MCP tools:** the MCP server didn't load, so Claude fell back to the API skills (which do need a PAT). Fix the MCP connection — reinstall the plugin and restart, then confirm via `/mcp` — rather than supplying a PAT. Opening a fresh chat once the server connects often clears this.
- **API-skill scripts fail with auth/401:** `RECAST_PAT` is unset, mistyped, or expired. Check the `env` block in `~/.claude/settings.json` (or `echo $RECAST_PAT` if you used a shell export), and verify the token in the Recast app.
- **Browser OAuth prompt reappears:** your session token expired — sign in again; this is expected occasionally.
- **API-skill scripts work in the terminal but not the desktop app:** the desktop app doesn't inherit shell-profile environment variables — move the PAT into `~/.claude/settings.json` as shown in Setup, then fully quit and relaunch the app.
- **Desktop app settings UI shows the connector as "not connected" or doesn't list the MCP server:** the Customize/Connectors panels don't reliably reflect MCP status. Trust `/mcp` inside a session, or just invoke a Recast tool.
- **`recast` server missing from `/mcp`:** reinstall the plugin and restart Claude Code.
