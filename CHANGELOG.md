# Changelog

All notable changes to the Recast marketplace and plugin for Claude Code are
documented in this file. This project adheres to [Semantic Versioning](https://semver.org/).

## [1.7.0] - 2026-09-18

### Added

- **Plans skill: create, edit and delete Goals.** Goals are no longer read-only.
  `POST /plans/{plan_id}/goals` takes a `form` with five required fields- `kpi_id`, `name`,
  `start_date`, `end_date` and `goal_value` and returns the new Goal's id. 
  `PATCH /nplas/{plan_id}/goals/{goal_id}` is a partial update of
  `name`, the dates, or `goal_value`, and `DELETE /nplas/{plan_id}/goals/{goal_id}` removes the
  Goal.


## [1.6.0] - 2026-09-11

### Added

- **Plans skill: create a plan from scratch.** Users can create a Plan from
  scratch by providing `label`, `start_date`/`end_date`, and a daily
  `budget` table, plus optional `lower_funnel_channel_caps` and custom spikes
  (`spike_type: "custom"` with `depvar_spike_groups`). `POST /plans` accepts
  this form alongside the existing `form: {optimization_id, label}` path. The
  skill also adds which channel names a plan accepts (the channels of the
  deployments backing the client's KPIs) and how far out `end_date` may go.

- **Plans skill: edit a plan by adding a version.**
  `POST /plans/{plan_id}/versions` applies a change to the plan's primary
  version and makes the result the new primary version; earlier versions stay
  in history unchanged. Editable fields are `budget`,
  `lower_funnel_channel_caps`, `spike_type` and `depvar_spike_groups` — the
  date range and label are not editable. The version `budget` is a sparse
  patch (only the cells you send change), and `base_version_id` must be the
  plan's current primary version, otherwise the call returns 409 and creates
  nothing.

### Changed

- **Plans skill: write-side quirks.** Plan writes are rate limited (roughly
  20 per minute, 429 with no `Retry-After`).

## [1.5.0] - 2026-09-10

### Added

- Session-start upgrade nudge: once a day the plugin checks GitHub for a newer release and shows a
  one-line notice with the `claude plugin update recast@recast` command when you're behind. Opt out via the
  `update_check` plugin setting; it exits early when marketplace auto-update is already on.

## [1.4.1] - 2026-09-03

### Changed

- **Marketplace manifest now enumerates the plugin's skills.** Added a `skills`
  path array to the `recast` plugin entry so third-party plugin aggregators that
  derive a skill count from the marketplace manifest report all five skills
  accurately. No change to install behavior — skills continue to auto-discover
  from `plugins/recast/skills/`.

## [1.4.0] - 2026-08-31

### Added

- **Plans skill: Goals are readable.**
  `GET /plans/{plan_id}/goals` returns a paginated index, filtered by `kpi_id`
  and by `status` (`expired`/`current`/`future`). There is no Goal show
  endpoint — pacing comes from the Goal's forecast, so
  `GET /plans/{plan_id}/forecasts` gained a `goal_id` filter and the forecast
  show response carries `goal_id` plus a `goal_highlights` block (`projected`,
  `pacing`, `success_probability`, and `details.spend`/`kpi`/`blended_roi`,
  each with `so_far`/`forecasted`/`projected`).

- **Plans skill: ranged and summarized CSV exports.** The version budget
  download takes `granularity` (`total`/`monthly`/`weekly`/`daily`) plus
  `start_date` and `end_date`, so a monthly or quarterly view no longer means
  pulling every day and resampling. Forecast result downloads take
  `start_date`/`end_date` wherever the CSV has a date column. Note that the
  leading columns change with granularity — `date` for daily, but `start_date`
  and `end_date` for anything summarized.

### Changed

- **Plans skill: refreshed API quirks.** The malformed-`plan_id` 503 is fixed
  and now returns 404 as documented.

## [1.3.0] - 2026-08-18

### Added

- **Plans skill: create a plan from a successful optimization.** The Plans API
  now has a write path — `POST /plans` derives a new Plan from a successful
  Optimizer run (`form: {optimization_id, label}`), with budget, dates, spikes,
  and lower-funnel caps all carried over from the optimization. `label` is the
  only field the request authors. The call is synchronous (no polling), and the
  created plan is read back through the existing index/version endpoints.

### Changed

- **Optimizer skill: point at saving a result as a Plan.** Once an optimization
  finishes successfully, the skill now offers to turn it into a Plan via the
  Plans API, and points to the plans-api skill for everything plan-side.

## [1.2.1] - 2026-07-31

### Changed
-**Updated the Optimizer skill** - Improved instructions for creating Optimizations from scratch and fixed documentation error regarding profit maximization target.

## [1.2.0] - 2026-07-30

### Added

- **Plans skill: spend adherence endpoints.** Read planned vs. actual spend
  per channel for a plan version - the app's Adherence section - via the new
  `/plans/{plan_id}/adherence` endpoints (list, show, CSV
  downloads).

## [1.1.0] - 2026-07-23

### Added

- **Plans skill.** Read-only access to Plans, versions, budgets, and the
  forecasts/counterfactuals generated for a plan. Invoke with `/recast:plans-api`.

### Changed

- **Reporter skill: support for pre-rendered Insights dashboard reports.**
  The reports list endpoint now accepts `include_prerendered=true` to
  surface auto-generated reports backing the Insights dashboard (tagged
  `prerendered: true`), alongside custom-created reports. Not every
  `report_type` has a pre-rendered version.

- **Forecaster skill: new ROI and spend fields.** Forecast results now include
  `total_forecasted_spend`, `expected_blended_roi`, `expected_observed_paid_roi`,
  and a redefined `expected_roi`, plus quantiles for each.
  `paid_roi` is removed.

## [1.0.2] - 2026-07-16

### Changed

- **Optimizer skill: `lower_funnel_caps` gains `off` and `manual` options.**
  `off` fully excludes a channel from the budget (previously only achievable
  via an unsupported `capped`/cap-0 workaround). `manual` spends exactly the
  uploaded budget with no cap. `custom_model_type` is now documented as
  required (`"roi"` or `"cpa"`), not nullable.

## [1.0.1] - 2026-07-13

### Changed

- **MCP auth clarified as OAuth-only.** The `recast` MCP server authenticates via
  OAuth (browser sign-in with your Recast account); it does not use a PAT. Removed
  the unused `X-Recast-PAT` header from `.mcp.json`. `RECAST_PAT` is still required
  for the code generated by the Reporter/Forecaster/Optimizer API skills. Updated
  `getting-started`, the plugin README, and troubleshooting to separate the two
  auth paths.

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
