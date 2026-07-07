# Changelog

All notable changes to the Recast marketplace and plugin for Claude Code are
documented in this file. This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-07

Initial public release of the Recast marketplace and the `recast` plugin for
Claude Code.

### Added

- **Recast MCP server** — connects Claude to the hosted Recast MCP server at
  `https://mcp.getrecast.com/mcp`, exposing tools for querying models,
  deployments, and reports. Authenticated per request with your `RECAST_PAT`.
- **Skills** for the public Recast APIs, invoked under the `/recast:` namespace:
  - `getting-started` — PAT generation, `RECAST_PAT` setup, OAuth sign-in, and
    auth troubleshooting.
  - `reporter-api` — pull data and reports (channel ROI, attribution, model
    results) as CSV.
  - `forecaster-api` — predict the outcomes of a known budget.
  - `optimizer-api` — prescribe a budget to hit a goal under constraints.
