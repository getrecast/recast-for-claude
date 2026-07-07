# Recast for Claude

The official Recast plugin marketplace for [Claude Code](https://claude.com/claude-code) — connect Claude to the Recast marketing-mix-modeling platform.

## Installation

```bash
claude plugin marketplace add getrecast/recast-for-claude
claude plugin install recast@recast
```

> Add the marketplace using the GitHub `owner/repo` shorthand shown above (or the full git URL). Do **not** add it via a direct URL to `marketplace.json` — plugin sources are repo-relative and will not resolve that way.

## What you get

The `recast` plugin provides:

- **Recast MCP server** — hosted tools for querying your models, deployments, and reports, available to Claude in every session.
- **Skills** — guided workflows for the Recast APIs, invoked under the `/recast:` namespace.

See [plugins/recast/README.md](plugins/recast/README.md) for setup (PAT + sign-in), a smoke test, the current skill list, and troubleshooting.

## Prerequisites

A Recast account is required. Accounts are provisioned by Recast — if you don't have one, contact your Recast representative.

## A note on trust

Claude Code plugins run with your user privileges. Install this plugin only from this repository (`getrecast/recast-for-claude`), published and maintained by Recast Engineering. Questions or issues: support@getrecast.com.
