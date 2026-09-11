---
name: plans-api
description: Use when reading, creating, or editing Recast Plans programmatically — "list my plans", "get a plan's budget", "pull a plan's forecast", "what changed between these two plan versions", "get counterfactual forecasts for this plan", "am I sticking to my plan's budget", "planned vs actual spend", "turn this optimization into a plan", "save this optimization as a plan", "build a plan from this budget", "create a plan from scratch", "change the budget on this plan", "edit my plan", "bump Meta's spend and save it", "save a new version of this plan", "what are my goals on this plan", "am I on track to hit my target", "what is my goal pacing". Translates plan goals into API requests for retrieving plans, versions, budgets, forecasts/counterfactuals, spend adherence and Goals, for creating plans (from scratch, or derived from a successful optimization), and for editing a plan by creating a new plan version. Renaming a plan and deleting a plan is still UI-only.
---

# Recast Plans API — Reading, Creating, and Versioning Plans

You are helping a Recast client work with their **Plans** (the Plans tab of the app) programmatically. Plans can be **read**, **created** (from scratch, or derived from a successful Optimizer run), and **edited** — where editing means adding a new version to the plan. What is still UI-only: renaming a plan or deleting a plan (https://docs.getrecast.com/docs/plans).

Most asks are still retrieval: finding the right plan, the right version, and the right data (config, budget, forecast, adherence, Goals) to pull. But when a client wants a plan built or changed, do it through the API rather than sending them to the UI — and read the **Writes: the two rules that bite** section below before you generate any create or version code, because the `budget` field means something different on each of the two write endpoints, and the `base_version_id` lock is easy to get wrong.

**Base URL:** `https://api.getrecast.com`
**All endpoints are under** `/v1/clients/{client_slug}/plans`.

---

## Conversation Flow

### 1. Gather context

Ask the client what they're trying to get, naturally (one or two at a time):

- **Read, create, or edit?** Three different paths — settle this first:
  - **Edit an existing plan** ("change the budget", "bump Meta 10%", "push the plan out a week") → Create version (`POST /plans/{plan_id}/versions`). Ask which plan, and what they want changed. Note up front that dates are *not* editable on a version — a different date range means a new plan.
  - **Create from an optimization** ("save this as a plan", "turn this optimization into a plan") → Create with `form: {optimization_id, label}`. Just ask for the optimization (id, or a link/name you can resolve via the optimizer-api skill's list endpoint) and the label.
  - **Create from scratch** ("build a plan from this budget", "make a plan for Q3") → Create with the from-scratch form. You need the label, the date range, and a budget table. Run the channel-discovery sequence below *before* building the payload; don't guess channel names. If they don't have a budget in mind, offer the optimization route instead — it derives one for them.
  - **Read** → continue with the questions below.
- **Which plan?** Do they know the plan's label (from the Plans tab) or its `id` (from the URL)? If not, they want to browse/filter the index.
- **Which version?** Almost always the **primary version** (the live, current one) — this is included directly on each plan in the Index response, so a separate versions call is often unnecessary. Only fetch the versions list if they want history or a specific past version.
- **What data?**
  - Configuration only (channels used, spike groups, lower funnel caps, compatible KPIs) → version show
  - The actual daily numbers → version budget (CSV)
  - How the plan is forecasted to perform going forward → the plan's regular forecast (`altcast_type: null`)
  - How the current model retroactively evaluates the plan's budget vs. what was actually spent, over days that have already elapsed → counterfactuals (`altcast_type: "planned"` / `"actuals"`)
  - Whether the plan is being followed — planned vs. actual **spend** per channel → adherence. Adherence compares spend *inputs*; counterfactuals compare modeled *outcomes*. "Am I on budget?" is adherence; "what did going off-plan cost me?" is counterfactuals. Clients often ask the second meaning the first.

Don't ask about coding language. If they specify one, use it. Otherwise use Python.

### 2. Confirm understanding

Before generating code, summarize:
- Which plan and version you're pulling
- What endpoint(s) you'll call
- What output format they want (raw JSON fields, a saved CSV, a summary table)

### 3. Generate code

Write a single, self-contained script following the Code Generation Rules below.

---

## Concepts

| Term | Meaning |
|---|---|
| **Plan** | A saved marketing plan: budget + configuration (spikes, contextual variables, lower funnel settings) over a date range. |
| **Plan Version** | A snapshot of a Plan. Every edit — in the UI or via `POST /plans/{plan_id}/versions` — creates a new version, which becomes the primary one. Only the **primary version** (`primary: true`) is live and editable; earlier versions are historical and immutable, and are also the only thing you can't use as an edit's base. |
| **plan_type** | `default` (auto-generated, refreshed every model update, assumes future spend follows historical patterns, 730-day window) or `custom` (user-built). |
| **status** | Derived, not stored: `future` / `current` / `expired`, based on today's date vs. the plan or version's start/end dates. Can be `null`. |
| **Budget metadata vs. budget data table** | The version show endpoint returns only the channel *names* used (`spend_channels`, `non_spend_channels`, `contextual_variables`, `lower_funnel_channels`). The actual daily values are a separate CSV download — it can be large, so it's not embedded in the JSON detail. |
| **Lower funnel channel caps** | Per lower-funnel-channel setting: `uncapped` (predicted from upper funnel), `capped` (max spend for the period — needs `cap` > 0), `off` (excluded), or `manual` (you supply the spend, so the channel needs its own budget column). **Quirk:** the app UI labels the `manual` option "provided" — the API returns `manual` for it. If a client asks about "provided" spend, look for `option: "manual"`. |
| **Spike / depvar spike groups** | Named promotional/holiday events, each tied to one or more depvars (the model components of a KPI) and dates. |
| **compatible_kpis / incompatible_kpis** | Which KPIs this version's inputs can and can't forecast. A KPI is incompatible when the plan is missing a channel/spike/contextual variable the model needs. |
| **Counterfactual / altcast_type** | A *retroactive* re-forecast of already-elapsed (in-sample) days, using the **current/latest model** rather than whatever model existed at the time — not a forward-looking prediction. Not a single comparison object either — two separate ordinary Forecast results, distinguished by `altcast_type`: `null` (the plan's regular, forward-looking forecast), `"planned"` (what the current model predicts the plan's **originally specified budget** would have produced over those historical days), or `"actuals"` (what the current model predicts the **actual spend** that occurred would have produced). No combined "planned vs. actual" payload; diffing the two is a client-side exercise. |
| **Recommendations** | Suggested budget reallocations to improve a forecasted outcome, at Conservative / Moderate / Aggressive risk levels. Available on all Forecasts associated with a Plan (see the forecaster-api skill for the `run_recommendations` flag). |
| **Adherence** | Planned vs. actual **spend** per channel for one plan version — the app's Adherence section. Input comparison only: no modeling, no KPI, no ROI. A new report is created each time new spend data lands, and both sides are scoped to that report's `report_through_date` (so `planned_spend` is not the plan's whole-period total). |
| **Goal** | A target on a KPI inside a Plan, over a date range within the Plan's period. A Plan can have several Goals, and their ranges may overlap; the budget and channels behind a Goal come from the Plan. **Its `status` does not follow the `status` row above:** a Goal's status is derived from the last date of data the model has, not from today's date, so a Goal whose window has already opened can still be `future`. Read-only, and there is no Goal show endpoint — pacing and probability come from the Goal's forecast (`goal_highlights`). |

---

## Recommended Workflow (Template-First)

If the client is starting from a successful optimization they want turned into a plan, that's a single call — see Create below — not this workflow.

**Before building a from-scratch plan**, resolve the client's channel universe from their models. Do not skip this and do not guess channel names — and specifically, do not enumerate channels from `GET /deployments?active=true` alone, which advertises channels `POST /plans` rejects as unknown (see Known API Quirks):

```
1. GET /kpis                          → collect every depvars[].slug across the KPIs
2. GET /deployments?active=true       → keep ONLY deployments whose dashboard_slug is one of those slugs
3. GET /deployments/{id}              → per deployment: spend_channels_labels, non_spend_channels_labels,
                                        lower_funnel_channel_labels, contextual_variable_defaults (keys
                                        = CV names, values = model defaults), spikes[].name,
                                        start_date / end_date (the plan's date bounds)
```

**Before editing a plan**, get the base version id. The budget is a patch, so you only fetch the current table when your edit is *relative* to the existing numbers (scale a channel by 10%) or when you need to show the client what's there:

```
1. GET /plans                                          → primary_version.id (this is your base_version_id)
2. GET /plans/{plan_id}/versions/{version_id}/budget    → optional: only if the edit needs current values
3. POST /plans/{plan_id}/versions                      → { base_version_id, form } with just the changed cells
```

The Index response already includes everything you usually need about the primary version — you rarely have to call the versions list at all.

```
1. GET /plans                                          → find the plan, note primary_version.id
2. GET /plans/{plan_id}/versions/{version_id}           → full config for that version (if you need more than the Index summary)
3. GET /plans/{plan_id}/versions/{version_id}/budget    → the daily budget as CSV (if you need the actual numbers)
```

Only reach for the versions list when the client explicitly wants history (comparing versions, finding a specific past one):

```
GET /plans/{plan_id}/versions   → list all versions, ordered created_at descending
```

---

## Writes: the two rules that bite

Read these before generating any create or version code. Everything else about writes is ordinary validation; these two are the ones that silently do the wrong thing.

**1. `budget` means two different things on the two write endpoints.** On `POST /plans` it is the plan's *whole* budget and must cover every day of `start_date`..`end_date`. On `POST /plans/{plan_id}/versions` it is a **sparse patch**: only the cells you send are written, and every other channel, date and contextual variable is inherited from the base version. Don't carry an assumption from one endpoint to the other.

Because a version budget is a patch, "raise Meta 10% on 2 July" really is a two-row payload — `[["date","meta"],["2026-07-02","1650"]]` — and it changes nothing else. Sending the whole table back also works and is harmless, but it's not required, and there is no way to *remove* a channel through the budget: setting it to `0` zeroes the spend but keeps the channel in the plan.

`lower_funnel_channel_caps` merges per channel too (listed channels updated, unlisted keep the base version's cap). `spike_type`/`depvar_spike_groups` are the exception — they replace rather than merge, so switching back to `spike_type: "model"` drops the custom groups. And any field omitted from the form entirely inherits, so a caps-only diff leaves the budget untouched.

**2. `base_version_id` must be the plan's *current* primary version.** That is the optimistic lock on concurrent editing. If someone saved a version between your read and your write, you get a **409** (`"base_version_id doesn't match plan's primary version id"`) and nothing is created. Don't retry blindly and don't cache the id across calls: re-read `primary_version.id`, re-apply the change on top of the new primary version, and send again. Two edits from the same base → first 201, second 409.

A rejected write is always a no-op: no orphan version, and the primary flag doesn't move. So a client can safely retry after fixing the payload.

---

## The Endpoints

### Create — `POST /v1/clients/{client_slug}/plans`

One endpoint, two mutually exclusive payloads. Both return **201** with only `{"id": "uuid string"}`, and both produce a plan with `plan_type: "custom"` and exactly one version, which is its primary version.

- **From an optimization** — `form: {optimization_id, label}`. Everything else is derived server-side.
- **From scratch** — `form: {label, start_date, end_date, budget, ...}`. You author the inputs.

**`optimization_id` decides the path, and it wins.** Send it alongside a complete from-scratch form and the optimization path is taken — the budget, dates, caps and spikes you supplied are discarded. Verified: a valid scratch form plus a bogus `optimization_id` returns 422 blaming `optimization_id`, not 201. So never carry `optimization_id` in a from-scratch payload "just in case", and if a client's create fails on a field they didn't think they were sending, check for a leftover `optimization_id`.

**Synchronous, but not instant** — unlike Optimizer/Forecaster creates, there is no `processing` state and nothing to poll: the request blocks while the plan is built, then the 201 comes back with the plan already fully readable. It is not sub-second, though, and how long it takes varies by client and plan — date range, channel count, and the volume of data behind the models all matter. Don't add a poll loop, don't assume it returns immediately, and don't quote a fixed duration. Set a generous request timeout (most HTTP clients' defaults are fine; just don't tighten to a couple of seconds).

Read the created plan back the same way you'd read any plan: `GET /plans` (filter/scan for the label) to get `primary_version.id`, then `GET /plans/{plan_id}/versions/{id}` for the full stored config.

**There is no DELETE for plans or plan versions.** Every successful create leaves a real plan on a real client until someone removes it in the UI. When you generate a create call for testing or exploration, label it obviously (a prefix plus a timestamp) and tell the client it will persist.

#### Path 1: from an optimization

Everything about the plan except its `label` is derived from the source optimization:

- **Budget & dates** — the plan's `start_date`/`end_date` span the optimization's constraint dates, and the daily budget derives from the optimization's recommended spend allocation.
- **Spikes** — carried over from the optimization's `depvar_configurations[].spikes`, but **only the dates that fall within the plan's own derived period.** A spike entirely outside that window (e.g. the optimization declared a spike from a different year than the plan's date range) is correctly dropped — expected scoping, not a bug.
- **Lower-funnel channel caps** — derived from the optimization's constraints.

```json
{ "form": { "optimization_id": 1003941377, "label": "Q3 Growth Plan" } }
```

Both fields required. `optimization_id` is the source optimization's integer id (the Optimizer API's id space, not a plan UUID). `label` is the only value actually authored by the request — extra fields alongside it are not accepted and cannot override any derived value. If the client wants to change a derived budget, create the plan and then edit it as a version.

Requires the source optimization to have `status == "success"` with results. One that's still processing, errored, or was canceled is rejected with 422 — there's nothing to derive a budget from.

#### Path 2: from scratch

```json
{
  "form": {
    "label": "Q3 Growth Plan",
    "start_date": "2026-07-01",
    "end_date": "2026-07-03",
    "budget": [
      ["date", "meta", "google", "holiday"],
      ["2026-07-01", "1000", "2000", "0"],
      ["2026-07-02", "1000", "2000", "0"],
      ["2026-07-03", "1500", "2000", "1"]
    ],
    "spike_type": "custom",
    "depvar_spike_groups": [
      { "spike_name": "Summer Sale",
        "depvars": [ { "depvar_slug": "total_sales", "dates": ["2026-07-03"] } ] }
    ],
    "lower_funnel_channel_caps": [
      { "channel_name": "branded_search", "option": "capped", "cap": 50000 }
    ]
  }
}
```

Read the created version back to confirm each setting landed as intended.

**The budget table.** Same shape as the version budget CSV: an array of arrays.

- Row 0 is the header. Its first cell is the literal string `date`; the rest are channel or contextual-variable names, matched **case-insensitively**.
- Each later row is one day: the date in `YYYY-MM-DD`, then one value per header column. Ragged rows are rejected.
- Day rows must cover `start_date`..`end_date` **exactly** — no gaps, no extra days, no duplicates, ascending order.
- Cells must parse as a number >= 0 (strings or JSON numbers both fine). Decimals and very large values round-trip exactly, no rounding. **A blank cell is coerced to `0`, not rejected** — quiet data loss for a caller who meant to send a value, and indistinguishable downstream from a deliberate zero.
- An all-zero (or all-blank) budget is a valid no-spend plan and is accepted, reporting `total_spend: 0`. Only a *structurally* empty budget fails: missing `budget`, `[]`, or a header row with no day rows.

**Which channel names are valid.** The universe is the deployments backing the client's **KPIs** — not every active deployment. A channel belonging to an active deployment that backs no KPI is rejected as unknown. Use the discovery sequence in Recommended Workflow. Recency is *not* the rule: KPI-linked deployments with different data end dates all contribute channels.

- At least one channel column is required — a budget of only contextual variables is rejected.
- Non-spend channels can be columns. A non-spend channel you omit is **absent from the plan** (not predicted for you) — unlike a contextual variable.
- Contextual variables you omit fall back to the model's most recent value. The budget CSV comes back with a column for **every** CV the models know, whether or not you sent it, so a read-back column is not proof you supplied it.
- `compatible_kpis` is only non-empty when the budget covers all of that model's channels (spend *and* non-spend). A partial budget yields a plan whose KPIs are all in `incompatible_kpis` — check this on the read-back if the client intends to forecast the plan, because nothing in the 201 warns you.

**Lower funnel channel caps.** Array of `{channel_name, option, cap?}`:

| option | Meaning | Requirement |
|---|---|---|
| `uncapped` | predicted from upper funnel activity | — |
| `capped` | predicted, up to a period maximum | `cap` required, must be > 0 |
| `off` | channel excluded from the plan | — |
| `manual` | you supply the spend (UI calls this "provided") | the channel **must** have its own budget column |

An omitted lower funnel channel defaults to `manual` if it has a budget column, uncapped otherwise. A cap naming a non-lower-funnel channel, or an unknown channel, is rejected.

**Spikes.** `spike_type` defaults to `"model"` (use the models' own spikes). `"custom"` lets you send `depvar_spike_groups` — and `"custom"` with no groups is valid (a plan with no spikes). Sending `depvar_spike_groups` without `spike_type: "custom"` is **rejected**, not ignored. Within a group: `spike_name` must be known to one of the models, `depvar_slug` must be one of the KPI depvar slugs, `dates` must be non-empty and every date must fall inside the plan's range.

**Date bounds.** Beyond `end_date` > `start_date` (so the shortest plan is two days):

- `start_date` may not precede the models' data start date.
- `end_date` may not be more than **730 days** past the models' data end date — and that limit is derived from the **earliest-ending** KPI-linked model, not the latest. A client whose oldest KPI-linked model stopped years ago may not be able to take a future-dated plan at all. Compute the limit as `min(end_date across KPI-linked deployments) + 730` before you offer a date range.

**When a client can't build plans at all.** If the same channel *name* is upper funnel in one KPI-linked model and lower funnel in another, plans are ambiguous and every create is refused with 422 — regardless of which channels the budget names. The message arrives under `error.details.base` (not a field key) and names the offending channels. If you see this, the answer is a model configuration fix, not a payload fix.

| Status | Meaning |
|---|---|
| 201 | Created — `{"id": "..."}` |
| 400 | Missing required parameter — blank body, missing `form` wrapper, missing `optimization_id`/`label`, an empty-string or whitespace-only `label` (treated as not provided, not as an invalid value), or malformed JSON |
| 401 | Missing or invalid token |
| 403 / 404 | Client not found or not reachable by this token |
| 422 | Validation failed — `error.details` keyed by the field at fault (`budget`, `end_date`, `label`, `lower_funnel_channel_caps`, `spike_type`, `depvar_spike_groups`, or `base`). Also: a duplicate `label`, a non-existent/malformed `optimization_id`, or a real optimization whose `status` isn't `success` |

### Create version (edit a plan) — `POST /v1/clients/{client_slug}/plans/{plan_id}/versions`

The only way to change a plan. Copies the plan's primary version, applies your diff, and makes the result the new primary version. The version you edited stays in history, **immutable** — that immutability is the reason this is a POST and not a PATCH.

```json
{
  "base_version_id": "4b026308-cce1-42f0-a1ac-2b6b902766ec",
  "form": { "budget": [["date","meta","google"], ["2026-07-01","1100","2000"]] }
}
```

Both keys required. See **Writes: the two rules that bite** for `base_version_id` and the budget-replaces-wholesale semantics — they are the two things to get right here.

**Exactly four editable fields.** `PlanVersionCreateForm` is `additionalProperties: false`, so anything else is rejected with a 422:

| Field | Notes |
|---|---|
| `budget` | A **sparse patch** — only the cells you send are written. Every date must fall inside the base version's range |
| `lower_funnel_channel_caps` | Merged per channel; unlisted channels keep the base version's cap |
| `spike_type` | `"model"` or `"custom"`. Switching back to `"model"` stops surfacing the custom groups (`depvar_spike_groups` reads back empty) |
| `depvar_spike_groups` | Only alongside `spike_type: "custom"` |

Rejected with 422: `label`, `start_date`, `end_date`, `optimization_id`, and any unknown key. **The date range is not editable** — the new version keeps the base version's window, which is why every date in a submitted budget must fall inside it. A different date range means a new plan, not a new version. **Version labels are auto-generated** ("Plan Version 2 <timestamp>"); the form takes no `label`, so don't offer renaming — renaming and deleting a version are UI-only.

**The primary flag only moves forward.** Creating a version is the only thing that changes which version is primary, and nothing — API or UI — can point it back at an earlier version. To "revert", read the old version's budget and post it as a new version.

**How the budget patch merges.** Only the `(date, column)` cells present in your table are written:

- A channel you omit keeps its budget. A date you omit keeps its row. A contextual variable you omit keeps the **base version's** value (it is *not* reset to the model default).
- You can **add** a channel that wasn't in the base budget by giving it a column.
- You cannot **remove** a channel — set it to `0`, which zeroes the spend but leaves the channel in the plan and in `budget_summary.spend_channels`.

**What the patch must still satisfy:** every date inside the base version's range (a table that is entirely outside, or that *mixes* in-range and out-of-range rows, is a 422 blaming `budget`); no repeated dates; a `date` first header cell; known channel/CV columns; values >= 0; and at least one day row (header-only is rejected). It does **not** have to cover the whole range or every channel, and rows do **not** have to be in ascending date order — both of those are create-only requirements.

**After a 201:** the new version is `primary: true`, the base version flips to `primary: false` (its `updated_at` moves; nothing else about it changes), the plan has exactly one more version, and the Index's `primary_version` points at the new one. Every earlier version still reports the budget it was created with — chain as many edits as you like.

| Status | Meaning |
|---|---|
| 201 | Created — `{"id": "..."}` |
| 400 | Missing `form`, an **empty `{}` form** (a no-change diff is refused rather than minting an identical version), or a missing / `null` / **empty-string** `base_version_id`; also malformed JSON. `error.details` names the parameter |
| 401 | Missing or invalid token — checked before the body, so a malformed unauthenticated request still reports 401 |
| 404 | No such plan under this client. A malformed (non-UUID) plan id also returns 404 |
| 409 | `base_version_id` is not the plan's current primary version. Body is a plain `ErrorResponse`: `error.message` only, **no `error.details`**. Covers a superseded id, an unknown UUID, and a malformed non-UUID string. A version id belonging to a *different* plan lands here or on 404 — treat both as "wrong base" |
| 422 | Validation failed — `error.details` keyed by the field at fault, same as create |

Note the split on `base_version_id`: an unusable-but-present value is a **409** (it simply isn't this plan's primary version), while an absent one — missing, `null`, or `""` — is a **400**. Don't collapse the two in error handling; a 409 means "re-read and retry", a 400 means "your request is malformed".

### Index — `GET /v1/clients/{client_slug}/plans`

Paginated list of plans. **Wrapped**: payload is in `response["data"]`, with a `pagination` object.

Query params (all optional): `page` (default 1), `per_page` (default 25, max 100), `plan_type` (`default`|`custom`), `label` (partial, case-insensitive match), `status` (`expired`|`current`|`future`, comma-separated for multiple e.g. `status=current,expired`), `kpi_ids` (one or more UUIDs — plans whose primary version is compatible with any of these KPIs; comma-separated `kpi_ids=id1,id2` or repeated `kpi_ids[]=id1&kpi_ids[]=id2`), `created_by` (one or more emails, or `Recast` for system-generated plans; comma-separated or repeated, same multi-value convention as `status`/`kpi_ids`).

### Version list — `GET /v1/clients/{client_slug}/plans/{plan_id}/versions`

Paginated, same as the Index. Ordered by `created_at` descending; exactly one item has `primary: true`.

### Version show — `GET /v1/clients/{client_slug}/plans/{plan_id}/versions/{id}`

Returned directly, no wrapper. Requires all three identifiers: `client_slug`, `plan_id`, and the version `id` — you cannot fetch a version by its ID alone.

### Version budget — `GET /v1/clients/{client_slug}/plans/{plan_id}/versions/{id}/budget`

Returns CSV, not JSON. Set `Accept: text/csv`. With no params, returns the full daily budget. Remaining columns are always the channels from the version's `budget_summary` metadata (spend + non-spend + contextual variables + lower funnel channels combined).

Three optional query params: `granularity` (one of `total`, `monthly`, `weekly`, `daily`) summarizes the CSV to that level; `start_date` and `end_date` trim the date range.

**The leading columns change with granularity, and this will break naive CSV parsing.** For `daily` (and for no granularity at all) the first column is `date`. For `total`, `monthly` and `weekly` the first two columns are `start_date` and `end_date` instead. Don't hardcode `date` as the index column — read the header, or branch on the granularity you requested. Prefer `granularity=monthly` over pulling daily rows and resampling client-side: it is the same answer with far less data.

### Plan forecasts & counterfactuals — `GET /v1/clients/{client_slug}/plans/{plan_id}/forecasts`

Plan-driven forecasts are nested under the plan, rather than exposed as query params on the general `/forecasts` endpoint. There is no separate version-scoped forecasts path — filtering to one version happens via a query param on this same endpoint. Each entry carries an ordinary Forecast `form`/`results` shape (see the forecaster-api skill), plus plan-specific fields: `plan_id`, `plan_label`, `plan_version_id`, `plan_version_number`, `kpi_id`, `kpi_label`, and `altcast_type`.

- `GET /plans/{plan_id}/forecasts` — forecasts across every version of the plan. Supports `kpi_id` and `plan_version_id` query filters (pass `plan_version_id` to narrow to one specific version). **Counterfactual (altcast) forecasts are excluded unless requested.** Omitting `altcast_types` returns only the plan's regular, forward-looking forecasts. Passing `altcast_types` (one or more of `planned`/`actuals` — multi-value via `altcast_types=planned,actuals` or `altcast_types[]=planned&altcast_types[]=actuals`, matching the `status`/`kpi_ids` convention elsewhere) switches to *only* counterfactuals of those kinds — it replaces the regular-forecasts result, it doesn't add to it. A blank or unrecognized value returns 422. Also supports `goal_id` to narrow to the forecasts behind one Goal — see the Goals section below.
- `GET /plans/{plan_id}/forecasts/{forecast_id}` — show a single forecast from a particular plan version. For a Goal's forecast this also returns `goal_id` and a `goal_highlights` block.
- `GET /plans/{plan_id}/forecasts/{forecast_id}/downloads/{key}` — download a CSV for one of the forecast's results. For downloads with a date column (often called `id`), `start_date` and `end_date` trim the range of dates returned; omit both to get all dates.

The human-readable label field (e.g. `"v3"`) is named differently across endpoint families. On the Index, Version list, and Version show endpoints it's `version_number`. On these Forecast endpoints, the version is referenced by two separate fields instead: `plan_version_id` (the version's actual UUID) and `plan_version_number` (the human-readable label). This is intentional (confirmed with engineering) — on a forecast object, an unqualified "version_number" would be ambiguous about which resource's version it means, so the forecast endpoints spell out `plan_version_number`. Don't assume the field name carries over between the two families.

**Counterfactuals** are retroactive re-forecasts, not forward-looking predictions: they take days that have already elapsed (in-sample) and ask what the plan's **current, latest model** would predict for them — as opposed to the plan's regular forecast, which looks forward. They are not a separate comparison endpoint either — they show up as ordinary entries in that same forecasts list, distinguished by `altcast_type`: `null` (the plan's regular, forward-looking forecast), `"planned"` (the current model's retroactive prediction of the outcome from the plan's **originally specified budget**), or `"actuals"` (the current model's retroactive prediction of the outcome from the **actual spend** that occurred). Each plan version has two counterfactual entries (one `"planned"`, one `"actuals"`). The API does not return the richer comparison view (highlight tiles, charts) shown in the UI's Counterfactual section — just these two underlying forecasts. If the client wants a planned-vs-actual comparison, that means fetching both and diffing them client-side. The `altcast_types` query filter takes the same values (`altcast_types=planned` / `altcast_types=actuals`, or both comma-separated).

**What each forecast's daily output actually covers, and what `start_date`/`end_date` mean.** This is the single most important nuance in this API — get it wrong and every downstream number gets misread. It's different for each of the three forecast kinds:

- **Regular forecast** (`altcast_type: null`): `start_date`/`end_date` describe only the forward-looking, actually-forecasted window. The daily output can extend earlier than `start_date` — those earlier dates are real historical actuals, not forecast. Only `start_date`–`end_date` is genuinely predicted.
- **Counterfactual of actuals** (`altcast_type: "actuals"`): fully retroactive. `start_date`/`end_date` exactly bound the dates where a complete actual budget exists across every included channel, and the *entire* daily output over that range is counterfactual — nothing forward-looking mixed in.
- **Counterfactual of planned budget** (`altcast_type: "planned"`): `start_date`/`end_date` cover *only* the retroactive portion (same date-availability rule as the actuals counterfactual above), even though the plan has a budget specified for its whole date range. The rest of the plan period, after `end_date`, is filled in by a regular forward forecast of the planned budget — and that continuation **is part of the daily output**, just not labeled by `start_date`/`end_date`. So the full result answers "what if I'd followed the planned budget exactly, past and future," and aggregate metrics like `expected_outcome` are computed over that whole combined range, not just the labeled window. That's the actual mechanism behind the UI mismatch, more precise than "it's a larger problem than the date fields."

**Gotcha:** the forward-looking segment of a "planned" counterfactual can differ numerically from calling the plan's separate regular forecast for the same future dates. The model carries over prior spend (adstock/carryover) from different inputs in each case — the "planned" counterfactual carries over from its own retroactive replay of the planned budget, the regular forecast carries over from real actual spend. Don't assume they'll match.

**Critical limitation — these still don't match the UI's Counterfactual section.** The UI gets its numbers from a separate internal `compute_plan_counterfactual` request that this API does not expose, and there's no way to trim or reconcile a counterfactual forecast's response to match it. Tell the client this API's counterfactual forecasts are directionally useful but won't reproduce the UI's Counterfactual section numbers exactly. A dedicated endpoint for that summarized view may ship in the future.

### Adherence — `GET /v1/clients/{client_slug}/plans/{plan_id}/adherence`

Planned vs. actual **spend** per channel for a plan version. Nested under the plan like forecasts — no version-scoped path; filter with the `plan_version_id` query param.

- `GET /plans/{plan_id}/adherence` — paginated list, `{"data": [...], "pagination": {...}}`
- `GET /plans/{plan_id}/adherence/{id}` — one report, returned directly, no wrapper
- `GET /plans/{plan_id}/adherence/{id}/downloads/{key}` — CSV

Spend in, spend out: there are no KPI, outcome, or ROI fields. Nothing here goes through the model. If the client wants outcome consequences, that's the plan's forecasts/counterfactuals.

What actually trips up code:

- **`lf_option` exists on `lower_funnel` entries only** — there's no `funnel` field on an entry; the nesting carries that.
- **There is no `nonspend_channels` key** — non-spend channels aren't served in this release.
- **A new report is created per data refresh**, so a plan accumulates many across its versions. Filter by `plan_version_id` (optional query param), then take the most recent with `status == "success"` — don't trust `data[0]`.
- **An empty index is a valid answer, not a failure** — 200 with empty `data` means no actual spend data exists for the plan's period yet. Normal for a `future` plan. Report it as "nothing yet"; don't raise or retry.
- **`planned_spend` is `null` for lower funnel channels that weren't provided** (`lf_option` of `capped`/`uncapped`) — the plan never stated a figure, so there's no target. Expected output, not missing data, and not the same as `0`: coercing it turns those channels into fabricated overspends.
- **Both sides are scoped to `report_through_date`**, so `actual_spend − planned_spend` is like-for-like. `planned_spend` is not the plan's whole-period total — that's `total_spend` on the version — so don't label it as the full budget.
- **Downloads** are `all-channels-adherence` plus one `{channel-name}-adherence` per channel — *except* capped/uncapped lower funnel channels, which have no daily planned spend and therefore no file. Read `downloads[].key` off the show response rather than building keys from channel names.

### Goals — `GET /v1/clients/{client_slug}/plans/{plan_id}/goals`

A Goal is a target on a KPI inside a plan, over a date range within the plan's period. Nested under the plan like forecasts and adherence. A plan can have several Goals, and their ranges may overlap. Paginated: `{"data": [...], "pagination": {...}}`.

Query filters: `kpi_id` (UUID) and `status` (one or more of `expired`/`current`/`future`, comma-separated or repeated as `status[]=`), plus `page`/`per_page`.

**There is no Goal show endpoint.** The index gives you the Goal's identity and target; everything else — pacing, success probability, the spend/KPI/ROI breakdown — comes from showing the Goal's forecast. Each Goal carries a `forecast_id` for its latest forecast, so that is one hop:

```
GET /plans/{plan_id}/goals                        → find the goal, note its forecast_id
GET /plans/{plan_id}/forecasts/{forecast_id}      → goal_id + goal_highlights (current pacing)

# or, to walk the goal's forecast history:
GET /plans/{plan_id}/forecasts?goal_id={goal_id}  → every forecast for that goal
```

Don't reach for `/goals/{id}` or `/goals/{id}/forecasts` — neither exists, both 404.

What actually trips up code:

- **`status` is relative to the model's data end, not to today.** This is the big one. A Goal is `future` while its window sits beyond the last date of data the model has, *even if that window has already opened on the calendar*. A Goal running 1–31 August is still `future` in mid-August when the model has data through 4 July. `current` means the data end falls inside the window; `expired` means the whole window is behind it. Never compute or "correct" a Goal's status from `date.today()` — you will disagree with the API and with the UI. If you need the reference date, it is the `end_date` of the KPI's active deployment (a KPI's depvar slugs match its deployments' `dashboard_slug`).
- **`id` is an integer**, unlike plan and version ids which are UUIDs. `kpi_id` is still a UUID.
- **An unknown `kpi_id` returns 404, not an empty list** — the filter is resolved against the client's KPIs. An invalid `status` returns 422 with the field named in `error.details`. Neither filter is silently ignored.
- **Don't assume a Goal's KPI is still compatible with the plan version.** The KPI is chosen from the compatible set when the Goal is created, but it can drift out of that set afterwards if the plan or model changes — the Goal keeps its `kpi_id` and the app raises a compatibility warning. So a Goal's `kpi_id` may appear in the version's `incompatible_kpis` rather than `compatible_kpis`. Never resolve a Goal's KPI by looking it up in `compatible_kpis` alone (you'll get a `None` and a crash); use the Goal's own `kpi_label`, or search both lists. If a Goal has no usable forecast, an incompatible KPI is a likely cause worth reporting to the user.
- **The target field is `goal_value`, not `value`.** Renamed 2026-08-27; older examples and the original API spec show `value`. Reading `goal["value"]` now yields a KeyError / NULL.
- **`forecast_id` is the goal's latest forecast — use it for current pacing.** Show it directly; there is no need to list the goal's forecasts and sort them. Use the `?goal_id={id}` filter only when you actually want the goal's *history* (how the projection and probability shifted over time), in which case sort by `created_at` yourself rather than trusting list order.
- **A goal retains its full forecast history, and each forecast's `goal_highlights` reflect the target in force when it ran.** So when walking history, an older forecast's `pacing`/`success_probability` can reference a target that has since been edited — correct as a record of that moment, but not current. Never present an older forecast's pacing as today's number; that is what `forecast_id` is for.
- **`processing_status` is separate from `status`** — it reports whether the Goal's forecast has finished computing (`success`), while `status` is about where the window sits relative to data. A Goal can be `current` with a `processing_status` that isn't yet `success`.
- **An empty index is a valid answer** — a plan with no Goals returns 200 with empty `data`. Report it as "no goals set", don't retry.

### Goal highlights (on the forecast show response)

When a forecast belongs to a Goal, its show response carries `goal_id` plus:

```json
{
  "goal_id": 247,
  "goal_highlights": {
    "projected": 9143778.0,
    "pacing": 1143778.0,
    "success_probability": 0.99,
    "details": {
      "spend":       { "so_far": 0, "forecasted": 1140011.5, "projected": 1140011.5 },
      "kpi":         { "so_far": 0, "forecasted": 9143778.0, "projected": 9143778.0 },
      "blended_roi": { "so_far": null, "forecasted": 8.02, "projected": 8.02 }
    }
  }
}
```

Relationships worth relying on (all verified against the dev API):

- `projected` is the same number as `details.kpi.projected` — don't present them as two independent figures.
- `pacing` is `projected` minus the Goal's `goal_value` (its target). Positive means projected to beat the target, negative means projected to fall short. It comes back as a **number**, not a signed string. Each forecast measures pacing against the target in force when it ran, so this reconciles against the goal's current `goal_value` on the latest forecast (the one `forecast_id` names) — not necessarily on an older one from the history.
- `success_probability` is a fraction between 0 and 1 — multiply by 100 for a percentage, and don't assume it's already a percent.
- For `spend` and `kpi`, `so_far + forecasted = projected`. Don't recompute `projected` some other way.
- `details.blended_roi` members are `null` where the matching spend is 0 — ROI is undefined with no spend. Guard for `None`; do not coerce to 0, which would render as "0x ROI" instead of "not applicable yet".
- A Goal still beyond the model's data end reports `so_far: 0` throughout, so all of `projected` is forecast rather than realized. Don't describe it as progress made.

---

## Response Envelope Reference

| Endpoint | Wrapper |
|---|---|
| `POST /plans` | Returned directly — `{"id": "..."}` only, no wrapper |
| `GET /plans` | `{"data": [...], "pagination": {...}}` |
| `GET /plans/{plan_id}/versions` | `{"data": [...], "pagination": {...}}` |
| `GET /plans/{plan_id}/versions/{id}` | Returned directly, no wrapper |
| `GET /plans/{plan_id}/versions/{id}/budget` | CSV body, not JSON |
| `GET /plans/{plan_id}/adherence` | `{"data": [...], "pagination": {...}}` |
| `GET /plans/{plan_id}/adherence/{id}` | Returned directly, no wrapper |
| `GET /plans/{plan_id}/adherence/{id}/downloads/{key}` | CSV body, not JSON |

---

## Schema Reference

### PlanCreateForm (create request body)

Two mutually exclusive shapes.

From an optimization:
```json
{
  "optimization_id": "integer — the source optimization's id; must have status: success with results",
  "label": "string — required, non-empty; the only field actually authored by the request"
}
```

From scratch:
```json
{
  "label": "string — required, non-empty, non-whitespace, unique across the client's plans",
  "start_date": "YYYY-MM-DD — required; not before the models' data start date",
  "end_date": "YYYY-MM-DD — required; strictly after start_date; at most 730 days past the EARLIEST-ending KPI-linked model's data end",
  "budget": "PlanBudgetTable — required; must cover start_date..end_date exactly",
  "lower_funnel_channel_caps": "[LowerFunnelChannelCap] — optional; omitted channel defaults to manual if it has a budget column, else uncapped",
  "spike_type": "model (default) | custom",
  "depvar_spike_groups": "[DepvarSpikeGroup] — optional; ONLY valid with spike_type: custom"
}
```

### PlanVersionCreateForm (create-version request body)

`additionalProperties: false` — unknown keys are **rejected** with 422.

```json
{
  "base_version_id": "uuid string — required, TOP LEVEL (not inside form); must be the plan's CURRENT primary version",
  "form": {
    "budget": "PlanBudgetTable — optional; a SPARSE PATCH on the base version's table. Only the cells sent are written; dates must fall inside the base version's range, but need not cover it",
    "lower_funnel_channel_caps": "[LowerFunnelChannelCap] — optional; merged per channel, unlisted channels keep the base version's cap",
    "spike_type": "model | custom — optional",
    "depvar_spike_groups": "[DepvarSpikeGroup] — optional; ONLY valid with spike_type: custom"
  }
}
```

Rejected inside `form`: `label`, `start_date`, `end_date`, `optimization_id`, anything unrecognised. An empty `form: {}` is a 400.

### PlanBudgetTable

Array of arrays. Row 0 is the header; rows 1..n are days.

```json
[
  ["date", "meta", "google", "holiday"],
  ["2026-07-01", "1000", "2000", "0"],
  ["2026-07-02", "1000.55", "2000", "0"]
]
```

Rules on **both** endpoints: header cell 0 must be the literal `"date"`; remaining cells are channel or contextual-variable names, matched **case-insensitively**, no duplicate columns; day rows are `YYYY-MM-DD` plus one value per header column, no ragged rows, no duplicate dates; cells parse as a number >= 0 (string or JSON number), decimals and very large values stored exactly, **a blank cell becomes `0`**; at least one day row.

Rules that apply **only to `POST /plans`** (create), where the table is the whole budget: day rows must cover `start_date`..`end_date` exactly, in ascending order, and at least one channel column is required (CV columns alone are rejected).

On **`POST /plans/{plan_id}/versions`** the same table is a sparse patch: it may cover any subset of dates and columns, in any order, as long as every date falls inside the base version's range.

### LowerFunnelChannelCap

```json
{
  "channel_name": "string — must be a lower funnel channel of a KPI-linked model",
  "option": "uncapped | capped | off | manual",
  "cap": "number > 0 — required when option is capped, otherwise omitted"
}
```

`manual` requires the channel to have its own column in the budget table.

### DepvarSpikeGroup

```json
{
  "spike_name": "string — a spike name known to one of the models",
  "depvars": [
    { "depvar_slug": "string — a depvar slug behind one of the client's KPIs",
      "dates": ["YYYY-MM-DD — non-empty; every date inside the plan's range"] }
  ]
}
```

### PlanCreateResponse (create response, 201 — also the create-version response)

```json
{ "id": "uuid string" }
```

No other fields, on either endpoint. For a create, read back the config via `GET /plans` (find by label) → `primary_version.id` → `GET /plans/{plan_id}/versions/{id}`. For a version, the returned id *is* the new primary version's id, so you can read it directly.

### PlanSummary (Index item)

```json
{
  "id": "uuid string",
  "label": "string",
  "plan_type": "default | custom",
  "status": "expired | current | future | null",
  "start_date": "YYYY-MM-DD | null",
  "end_date": "YYYY-MM-DD | null",
  "created_by": "email string, or 'Recast'",
  "primary_version": {
    "id": "uuid string",
    "label": "string | null",
    "version_number": "string | null (e.g. 'v3')",
    "total_spend": "number | null"
  },
  "created_at": "ISO8601 | null",
  "updated_at": "ISO8601 | null"
}
```

Every plan has a primary version — `primary_version` is always present, never `null`.

### PlanVersionSummary (versions-list item)

```json
{
  "id": "uuid string",
  "version_number": "string | null (e.g. 'v3')",
  "label": "string | null",
  "plan_id": "uuid string",
  "primary": "boolean",
  "total_spend": "number | null",
  "created_by": "string",
  "created_at": "ISO8601 | null",
  "updated_at": "ISO8601 | null"
}
```

### PlanVersionDetail (version-show response)

```json
{
  "id": "uuid string",
  "plan_id": "uuid string",
  "version_number": "string | null",
  "label": "string | null",
  "primary": "boolean",
  "status": "expired | current | future | null",
  "start_date": "YYYY-MM-DD | null",
  "end_date": "YYYY-MM-DD | null",
  "created_by": "string",
  "total_spend": "number | null",
  "spike_type": "model | custom | null",
  "budget_summary": {
    "spend_channels": ["string", "..."],
    "non_spend_channels": ["string", "..."],
    "contextual_variables": ["string", "..."],
    "lower_funnel_channels": ["string", "..."]
  },
  "lower_funnel_channel_caps": [
    { "channel_name": "string", "option": "uncapped | off | capped | manual", "cap": "number | null" }
  ],
  "depvar_spike_groups": [
    {
      "spike_name": "string",
      "depvars": [
        { "depvar_slug": "string", "dates": ["YYYY-MM-DD", "..."] }
      ]
    }
  ],
  "compatible_kpis": [ { "id": "uuid", "slug": "string", "label": "string" } ],
  "incompatible_kpis": [ { "id": "uuid", "slug": "string", "label": "string" } ],
  "created_at": "ISO8601 | null",
  "updated_at": "ISO8601 | null"
}
```

Note `budget_summary` here is **metadata only** (channel names) — not the daily data table.

### PlanForecastSummary (plan forecasts-list item)

```json
{
  "id": "integer",
  "name": "string | null",
  "status": "ready | processing | success | error | canceled",
  "altcast_type": "null | 'planned' | 'actuals' (null = the plan's regular forecast)",
  "plan_version_id": "uuid string (the version's actual ID)",
  "plan_version_number": "string | null (e.g. 'v3' — the human-readable label)",
  "kpi_id": "uuid string",
  "kpi_label": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### PlanForecastDetail (plan forecast-show response)

```json
{
  "id": "integer",
  "name": "string | null",
  "status": "ready | processing | success | error | canceled",
  "altcast_type": "null | 'planned' | 'actuals'",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "plan_id": "uuid string",
  "plan_label": "string",
  "plan_version_id": "uuid string",
  "plan_version_number": "string | null",
  "kpi_id": "uuid string",
  "kpi_label": "string",
  "form": "ForecastForm — see the forecaster-api skill (budget 2D array, depvar_configurations, etc.)",
  "results": "ForecastResult[] — only present when status is 'success'. See the forecaster-api skill.",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

Both are returned directly by their respective endpoints — the list endpoint wraps `PlanForecastSummary` items in the usual `{"data": [...], "pagination": {...}}`; the show endpoint returns `PlanForecastDetail` with no wrapper.

Each entry in `results[].downloads` has a `key`. Fetch its CSV with `GET /plans/{plan_id}/forecasts/{forecast_id}/downloads/{key}`.

**ROI and spend fields map directly to the UI's highlight labels (important for client-facing copy):**

| Field | UI label |
|---|---|
| `expected_outcome` | (unlabeled outcome number, unambiguous) |
| `total_forecasted_spend` | "Total Forecasted Spend" |
| `expected_blended_roi` | "Expected Blended ROI" |
| `expected_observed_paid_roi` | "Expected Observed Paid ROI" |
| `expected_roi` | "Expected ROI" — the **paid** ROI of the forecasted spend (same paid basis as `expected_observed_paid_roi`, not blended with baseline/organic), but counting outcome realized *during or after* the forecast window ends (e.g. adstock/carryover). The two paid-ROI fields differ only in time window counted. `expected_blended_roi` is a different, windowed-and-blended figure — don't treat any of the three as interchangeable. |

**Each of the four fields above also has a companion `_quantiles` object** — `expected_outcome_quantiles`, `expected_blended_roi_quantiles`, `expected_observed_paid_roi_quantiles`, `expected_roi_quantiles` — each shaped `{"median": number, "p25": number, "p75": number}`. The point-estimate field (e.g. `expected_roi`) and its `_quantiles.median` aren't necessarily identical; use whichever the client actually wants (a single point estimate vs. an uncertainty range).

### Adherence (list item and show response)

List items carry `id` (integer — the adherence report's own id), `plan_version_id`, `plan_version_number`, `status` (`success` | `error`), `report_through_date` (`YYYY-MM-DD | null`), `created_at`, `updated_at`. As on the forecast endpoints the version label is `plan_version_number`, **not** `version_number`. The show response adds `plan_id` plus:

```json
{
  "highlights": {
    "total": { "planned_spend": "number | null", "actual_spend": "number | null" },
    "spend_channels": {
      "upper_funnel": [
        {
          "channel_name": "string",
          "planned_spend": "number | null",
          "actual_spend": "number | null"
        }
      ],
      "lower_funnel": [
        {
          "channel_name": "string",
          "lf_option": "uncapped | capped | manual",
          "planned_spend": "number | null",
          "actual_spend": "number | null"
        }
      ]
    }
  },
  "downloads": [ { "description": "string", "key": "all-channels-adherence | {channel-name}-adherence" } ]
}
```

`spend_channels` is a nested object — no `nonspend_channels`, and nothing in the response is modeled (no KPI, outcome, ROI, or quantiles).

---

### Goal (goals-index item)

```json
{
  "id": "integer",
  "name": "string",
  "goal_value": "number — the KPI target",
  "status": "expired | current | future — relative to the model's data end, NOT today",
  "processing_status": "string — e.g. 'success'; whether the goal's forecast has computed",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "kpi_id": "uuid string",
  "kpi_label": "string",
  "forecast_id": "integer — the goal's LATEST forecast; show it for current pacing",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

Wrapped in the usual `{"data": [...], "pagination": {...}}`. There is no Goal detail schema — the index item above is the whole Goal payload, and the rest lives on the forecast show response as `goal_id` + `goal_highlights`.

### GoalHighlights (on PlanForecastDetail, when the forecast belongs to a Goal)

```json
{
  "goal_id": "integer",
  "goal_highlights": {
    "projected": "number — same as details.kpi.projected",
    "pacing": "number — projected minus the goal's target value",
    "success_probability": "number in [0, 1]",
    "details": {
      "spend":       { "so_far": "number", "forecasted": "number", "projected": "number" },
      "kpi":         { "so_far": "number", "forecasted": "number", "projected": "number" },
      "blended_roi": { "so_far": "number | null", "forecasted": "number | null", "projected": "number | null" }
    }
  }
}
```

Absent entirely on forecasts that aren't tied to a Goal — check for the key, don't assume it.

---

## Translating Client Asks to API Calls

| Client says | What to do |
|---|---|
| "Turn this optimization into a plan" | `POST /plans` with `form: {optimization_id, label}` — only works if the optimization's `status` is `success` |
| "Make a plan called 'X' from optimization 12345" | Same call: `optimization_id: 12345`, `label: "X"` |
| "Build me a plan from this budget" / "create a plan from scratch" | Discovery first (`GET /kpis` → KPI-linked `GET /deployments/{id}`), then `POST /plans` with `form: {label, start_date, end_date, budget, ...}` |
| "Make a plan for Q3 but I don't have a budget yet" | Point them at the optimization route — `POST /plans` with `optimization_id` derives the budget. Don't invent spend numbers |
| "Change the budget on this plan" / "edit my plan" | `POST /plans/{plan_id}/versions` with `{base_version_id: primary_version.id, form: {budget: <full table>}}` |
| "Bump Meta 10% on this plan" | Download the primary version's budget CSV to get the current numbers, then post a patch of just `[["date","meta"], ...]` — everything else is inherited |
| "Set Meta to 1500 on 2 July" | No read needed. `form: {budget: [["date","meta"],["2026-07-02","1500"]]}` — a two-row patch changes that one cell |
| "Take a channel off this plan" | Not possible — a version budget can't remove a channel. Set it to `0`; it stays in `budget_summary.spend_channels` with zero spend |
| "Cap branded search at 50k on this plan" | `POST /plans/{plan_id}/versions` with `form: {lower_funnel_channel_caps: [{channel_name, option: "capped", cap: 50000}]}` — caps merge per channel, so no need to resend the others, and the budget is untouched |
| "Push this plan out by a week" / "change the plan's dates" | Not possible on a version — dates aren't editable. A new date range means a new plan (`POST /plans` from scratch) |
| "Rename this plan / version" or "delete this version" | Not in the API — UI only |
| "Make v2 primary again" / "revert to the old version" | Not possible anywhere, API or UI — the primary flag only moves forward. Read the old version's budget and post it as a **new** version instead |
| "Two of us are editing the same plan" | Explain the `base_version_id` lock: re-read `primary_version.id` immediately before each write; a 409 means someone else saved first, so re-read and re-apply |
| "Which channel names can I use?" | `GET /kpis` for depvar slugs, then the deployments whose `dashboard_slug` matches — **not** every active deployment |
| "Show me all my plans" | `GET /plans` (paginate as needed) |
| "What plans are running right now?" | `GET /plans?status=current` |
| "Find the plan called 'Q3 Growth Plan'" | `GET /plans?label=Q3` then match exactly on `label` client-side, or just filter server-side and take the match |
| "Which plans can forecast Revenue?" | `GET /plans?kpi_ids={revenue_kpi_id}` |
| "Which plans can forecast Revenue or Conversions?" | `GET /plans?kpi_ids={revenue_kpi_id},{conversions_kpi_id}` |
| "What plans has Jane built?" | `GET /plans?created_by=jane@example.com` |
| "What channels are in this plan?" | `GET /plans/{plan_id}/versions/{version_id}` → `budget.spend_channels` etc. |
| "Give me the daily budget as a spreadsheet" | `GET /plans/{plan_id}/versions/{version_id}/budget` with `Accept: text/csv` |
| "How has this plan changed over time?" | `GET /plans/{plan_id}/versions` → compare `total_spend`/`created_at` across versions, then show individual versions for detail |
| "Can this plan forecast Revenue?" | `GET /plans/{plan_id}/versions/{version_id}` → check if the KPI appears in `compatible_kpis` vs `incompatible_kpis` |
| "What promotions are baked into this plan?" | `GET /plans/{plan_id}/versions/{version_id}` → `depvar_spike_groups` |
| "Is branded search capped in this plan?" | `GET /plans/{plan_id}/versions/{version_id}` → `lower_funnel_channel_caps` |
| "What will this plan produce? / What's my forecasted ROI?" | `GET /plans/{plan_id}/forecasts?plan_version_id={version_id}` — pull the forecast(s) for that version |
| "What's the impact of not sticking to my plan?" | `GET /plans/{plan_id}/forecasts?plan_version_id={version_id}&altcast_types=planned,actuals` — diff the two, but tell the client this won't match the UI's Counterfactual section exactly (see the limitation above) |
| "Show me every forecast for this plan targeting Revenue" | `GET /plans/{plan_id}/forecasts?kpi_id={revenue_kpi_id}` |
| "Show me every forecast tied to this specific plan version" | `GET /plans/{plan_id}/forecasts?plan_version_id={version_id}` |
| "Am I on budget? / how much have we spent?" | `GET /plans/{plan_id}/adherence?plan_version_id={version_id}` → show the most recent successful report, read `highlights` |
| "Which channels are over/under-spending?" | Same call → flatten `highlights.spend_channels.upper_funnel` + `.lower_funnel`, sort by `actual_spend − planned_spend`, skipping `null` planned values |
| "Show me daily planned vs. actual for Meta" | Adherence show → `GET /plans/{plan_id}/adherence/{id}/downloads/meta-adherence`. Confirm the key is in `downloads` first — capped/uncapped lower funnel channels don't have one |
| "How are my non-spend channels tracking?" | Not available — adherence covers spend channels only in this release |
| "What Goals are set on this plan?" | `GET /plans/{plan_id}/goals` |
| "Which Goals are actually being tracked right now?" | `GET /plans/{plan_id}/goals?status=current` — and explain that `current` means the model's data has reached the Goal's window, not that the window is open on the calendar |
| "What's my Goal pacing? / Will I hit my Goal?" | `GET /plans/{plan_id}/goals` → note the goal `forecast_id` → `GET /plans/{plan_id}/forecasts/{forecast_id}` → read `goal_highlights.pacing` and `goal_highlights.success_probability` |
| "How far along is my Goal?" | Same call → `goal_highlights.details.kpi.so_far` vs `.projected`. If `so_far` is 0 the Goal hasn't started in data terms — say that rather than "0% progress" |
| "Show me Goals on the Revenue KPI" | `GET /plans/{plan_id}/goals?kpi_id={revenue_kpi_id}` |
| "Give me the budget by month / quarter / total" | `GET /plans/{plan_id}/versions/{version_id}/budget?granularity=monthly` — remember the leading columns become `start_date`,`end_date` for any non-daily granularity |
| "Just the budget for July" | `.../budget?start_date=2026-07-01&end_date=2026-07-31` — trim server-side rather than downloading everything |
| "Only give me the forecast CSV for these dates" | `.../forecasts/{forecast_id}/downloads/{key}?start_date=...&end_date=...` — works on downloads that have a date column |

---

## Common Scenarios with Full Examples

### Scenario 1: Create a plan from a successful optimization, then read it back

```python
# 1. Create — synchronous, no polling. Requires a successful optimization
#    (use the optimizer-api skill to find/run one if the client doesn't have
#    an id yet).
create_resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans",
    headers=HEADERS,
    json={"form": {"optimization_id": 1003941377, "label": "Q3 Growth Plan"}},
)
assert create_resp.status_code == 201, f"Failed: {create_resp.text}"
plan_id = create_resp.json()["id"]

# 2. Read it back: find it in the index, then pull its primary version.
plans = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans",
    headers=HEADERS, params={"label": "Q3 Growth Plan", "per_page": 100},
).json()["data"]
plan = next(p for p in plans if p["id"] == plan_id)

version_id = plan["primary_version"]["id"]
version = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions/{version_id}",
    headers=HEADERS,
).json()

print(f"Created plan {plan_id}, version {version['version_number']}: "
      f"{version['start_date']} to {version['end_date']}, total_spend={version['total_spend']}")
# Spike groups only include spikes whose dates fall within [start_date, end_date] —
# a spike entirely outside that window is correctly absent, not a bug.
print("Spike groups:", [g["spike_name"] for g in version["depvar_spike_groups"]])
```

### Scenario 2: Build a plan from scratch

```python
from datetime import date, timedelta

# 1. Resolve the channel universe from the models. The KPI scoping matters:
#    an active deployment that backs no KPI advertises channels POST /plans
#    rejects as unknown.
kpis = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/kpis", headers=HEADERS).json()["data"]
kpi_slugs = {d["slug"] for k in kpis for d in k["depvars"]}

deps = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments",
    headers=HEADERS, params={"active": "true", "per_page": 100},
).json()["data"]

models = []
for d in deps:
    if d["dashboard_slug"] not in kpi_slugs:
        continue  # backs no KPI — its channels are not valid plan inputs
    models.append(requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments/{d['id']}", headers=HEADERS,
    ).json())
assert models, "No active deployment backs a KPI — a plan can't be built"

spend       = {c for m in models for c in m["spend_channels_labels"]}
lower       = {c for m in models for c in m["lower_funnel_channel_labels"]}
upper       = {c for m in models for c in m["upper_funnel_channel_labels"]}
cv_defaults = {k: v for m in models for k, v in m["contextual_variable_defaults"].items()}

# A channel that is upper funnel in one KPI-linked model and lower funnel in
# another makes plans ambiguous — every create 422s. Check before building.
assert not (upper & lower), f"Dual-funnel channels block plan creation: {upper & lower}"

# 2. Date bounds: not before the models' data start, and at most 730 days past
#    the EARLIEST-ending model's data end (verified: a client with models ending
#    2023-08-06 and 2025-06-22 is limited to 2025-08-05, i.e. the earlier one).
model_start = min(date.fromisoformat(m["start_date"]) for m in models)
end_limit   = min(date.fromisoformat(m["end_date"]) for m in models) + timedelta(days=730)

# Plan the next 90 days, clamped to what the models can speak to. A client
# whose oldest KPI-linked model stopped years ago can have end_limit in the
# past, in which case no future-dated plan is possible at all — hence the
# assert rather than silently building a window the API will reject.
start = max(date.today() + timedelta(days=1), model_start)
end   = min(start + timedelta(days=89), end_limit)
assert end > start, \
    f"No usable future window: the models only allow {model_start}..{end_limit}"

# 3. Build the budget table from the DISCOVERED channel set, not a hand-written
#    list. Every channel the models use needs a column or no KPI will be able to
#    forecast the plan, and the only way to know the full set is the discovery
#    above.
non_spend = {c for m in models for c in m["non_spend_channels_labels"]}

# What the client actually wants to spend, per channel per day.
wanted  = {"meta": "1000", "google": "2000"}
unknown = set(wanted) - spend - non_spend
assert not unknown, f"Not channels of any KPI-linked model: {unknown}"

# Channels the client didn't budget for still get a column, at 0. "Planned to
# spend nothing" and "left out of the plan" are different things: the first
# keeps the KPI forecastable, the second is what makes it incompatible.
channels = {c: wanted.get(c, "0") for c in sorted(spend | non_spend)}

# Contextual variables may be omitted — they fall back to the model's most
# recent value — but sending them makes the plan explicit about what it assumes.
cvs = {k: str(v) for k, v in cv_defaults.items()}

columns = list(channels) + list(cvs)
days    = [start + timedelta(days=i) for i in range((end - start).days + 1)]
budget  = [["date"] + columns] + [
    [d.isoformat()] + [channels.get(c, cvs.get(c)) for c in columns] for d in days
]

form = {
    "label": "Q3 Growth Plan",
    "start_date": start.isoformat(),
    "end_date": end.isoformat(),
    "budget": budget,
    # Every lower funnel channel gets an explicit entry, so nothing falls
    # through to the omission default by accident. 'manual' is the right option
    # here because the table above gives every channel a column, which is what
    # "provided" spend means. If you'd rather the model predict a lower funnel
    # channel's spend, use 'uncapped' and drop it from `channels` instead.
    "lower_funnel_channel_caps": [
        {"channel_name": c, "option": "manual"} for c in sorted(lower)
    ],
}

resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans", headers=HEADERS, json={"form": form},
)
# 422 details are keyed by the offending field — surface them, don't swallow.
assert resp.status_code == 201, f"{resp.status_code}: {resp.text}"
plan_id = resp.json()["id"]

# 4. Read back and check forecastability. Nothing in the 201 warns you that the
#    budget was too thin for any KPI. A new plan has exactly one version.
versions = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions", headers=HEADERS,
).json()["data"]
version = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions/{versions[0]['id']}",
    headers=HEADERS,
).json()
print(f"Created {plan_id}: total_spend={version['total_spend']}, "
      f"compatible KPIs={[k['label'] for k in version['compatible_kpis']]}")
if not version["compatible_kpis"]:
    print("No KPI can forecast this plan — the budget is missing channels the models need:",
          [k["label"] for k in version["incompatible_kpis"]])
```

### Scenario 3: Edit a plan — patch one channel as a new version

```python
import io as _io
import pandas as pd

plan_id = "8d777078-044e-4e3d-8d95-8dc14daf8d93"   # from GET /plans, or the Plans tab URL
CHANNEL, FACTOR = "meta", 1.10

def primary_version(plan_id):
    """Always re-read this immediately before a write — it is the optimistic lock."""
    versions = requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions",
        headers=HEADERS, params={"per_page": 100},
    ).json()["data"]
    return next(v for v in versions if v["primary"])

def budget_df(plan_id, version_id):
    csv = requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions/{version_id}/budget",
        headers={**HEADERS, "Accept": "text/csv"},
    )
    csv.raise_for_status()
    return pd.read_csv(_io.StringIO(csv.text))

# Retry loop, because a 409 means someone else saved a version between our read
# and our write. Re-read, re-apply, resend — never resend the same base id.
for attempt in range(3):
    base = primary_version(plan_id)

    # We only need the current budget because this edit is RELATIVE (×1.10).
    # For an absolute value ("set meta to 1500 on 2 July") skip this entirely
    # and post the patch straight away.
    df = budget_df(plan_id, base["id"])
    assert CHANNEL in df.columns, f"{CHANNEL} is not in this plan's budget"

    # The version budget is a sparse PATCH: send only date + the one column.
    # Every other channel, date and contextual variable is inherited from the
    # base version. Do NOT pad the table with the channels you aren't changing,
    # and never pad with zeros — that would zero them.
    patch = [["date", CHANNEL]] + [
        [str(d), str(v * FACTOR)] for d, v in zip(df["date"], df[CHANNEL])
    ]

    resp = requests.post(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions",
        headers=HEADERS,
        json={"base_version_id": base["id"], "form": {"budget": patch}},
    )
    if resp.status_code == 409:
        print("Someone else saved a version first; re-reading and retrying.")
        continue
    assert resp.status_code == 201, f"{resp.status_code}: {resp.text}"
    new_id = resp.json()["id"]
    print(f"New primary version {new_id} (was {base['id']})")
    break
else:
    raise RuntimeError("Gave up after repeated 409s — the plan is being actively edited")

# Show total_spend so an unintended change is visible before anyone relies on it.
after = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions/{new_id}", headers=HEADERS,
).json()
print(f"total_spend {base['total_spend']} -> {after['total_spend']}")

# A single day: two rows, and nothing else in the plan moves.
one_day = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions",
    headers=HEADERS,
    json={
        "base_version_id": primary_version(plan_id)["id"],
        "form": {"budget": [["date", CHANNEL], ["2026-07-02", "1650"]]},
    },
)
assert one_day.status_code == 201, f"{one_day.status_code}: {one_day.text}"

# Caps only? Omit the budget entirely. Caps merge per channel, so unlisted
# lower funnel channels keep their settings.
caps_only = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan_id}/versions",
    headers=HEADERS,
    json={
        "base_version_id": primary_version(plan_id)["id"],
        "form": {"lower_funnel_channel_caps": [
            {"channel_name": "branded_search", "option": "capped", "cap": 50000}
        ]},
    },
)
assert caps_only.status_code == 201, f"{caps_only.status_code}: {caps_only.text}"
```

### Scenario 4: List current plans and their total spend

```python
import os, requests

BASE_URL = "https://api.getrecast.com"
CLIENT_SLUG = "democlient"
PAT = os.environ["RECAST_PAT"]
HEADERS = {"Authorization": f"Bearer {PAT}", "Accept": "application/json"}

resp = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans",
    headers=HEADERS,
    params={"status": "current", "per_page": 100},
)
assert resp.status_code == 200, f"Failed: {resp.text}"

for plan in resp.json()["data"]:
    spend = plan["primary_version"]["total_spend"]  # every plan has a primary version
    print(f"{plan['label']} ({plan['plan_type']}): total_spend={spend}")
```

### Scenario 5: Pull the primary version's full config for a named plan

```python
plans = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans",
    headers=HEADERS, params={"label": "Q3 Growth Plan", "per_page": 100},
).json()["data"]
plan = next(p for p in plans if p["label"] == "Q3 Growth Plan")

version_id = plan["primary_version"]["id"]
version = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/versions/{version_id}",
    headers=HEADERS,
).json()

print("Spend channels:", version["budget"]["spend_channels"])
print("Compatible KPIs:", [k["label"] for k in version["compatible_kpis"]])
print("Incompatible KPIs:", [k["label"] for k in version["incompatible_kpis"]])
```

### Scenario 6: Download the budget CSV for the primary version

```python
import io, pandas as pd

csv_resp = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/versions/{version_id}/budget",
    headers={**HEADERS, "Accept": "text/csv"},
)
assert csv_resp.status_code == 200, f"Failed: {csv_resp.text}"

df = pd.read_csv(io.StringIO(csv_resp.text))
df.to_csv("plan_budget.csv", index=False)
print(f"Saved plan_budget.csv ({len(df)} rows, columns: {list(df.columns)})")
```

### Scenario 7: Compare total_spend across all versions of a plan

```python
versions = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/versions",
    headers=HEADERS,
    params={"per_page": 100},
).json()["data"]

for v in versions:
    marker = " (primary)" if v["primary"] else ""
    print(f"{v['version_number']}{marker}: total_spend={v['total_spend']}, created_at={v['created_at']}")
```

### Scenario 8: Pull a plan version's forecast, plus its planned-vs-actual counterfactuals

```python
# 1. altcast_types is a swap, not an additive filter: omitting it returns only
#    the plan's regular, forward-looking forecast(s) for this version. You need
#    a second, separate call with altcast_types set to get the counterfactuals.
# List items are summaries only — they do NOT include `results`; you have to
# show each one you care about.
regular_forecasts = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts",
    headers=HEADERS,
    params={"plan_version_id": version_id},
).json()["data"]

altcast_forecasts = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts",
    headers=HEADERS,
    params={"plan_version_id": version_id, "altcast_types": "planned,actuals"},
).json()["data"]
altcast_summaries = {f["altcast_type"]: f for f in altcast_forecasts}
assert set(altcast_summaries) == {"planned", "actuals"}, f"Expected 'planned' and 'actuals' altcasts, got {list(altcast_summaries)}"

# 2. Show each one to get its results (form/results are only on the show response)
def show_forecast(forecast_id):
    return requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts/{forecast_id}",
        headers=HEADERS,
    ).json()

primary = show_forecast(regular_forecasts[0]["id"])
result = primary["results"][0]
print(f"Expected outcome: {result['expected_outcome']}")
print(f"Total forecasted spend: {result['total_forecasted_spend']}")
print(f"Expected ROI: {result['expected_roi']}")
print(f"Expected Blended ROI: {result['expected_blended_roi']}")

for altcast_type, summary in altcast_summaries.items():
    detail = show_forecast(summary["id"])
    outcome = detail["results"][0]["expected_outcome"] if detail.get("results") else None
    print(f"Counterfactual ({altcast_type}): expected_outcome={outcome}")
```

### Scenario 9: Reconstruct the UI's Counterfactual summary (planned vs. actual)

The UI's Counterfactual section shows a planned-vs-actual comparison for a specific window: **the counterfactual period**. Its `start_date`/`end_date` come directly from the counterfactual forecast's own response (the planned and actuals counterfactuals for the same plan version share the same window) — no need to compute it separately.

This isn't a single API call — the API doesn't expose the UI's underlying `compute_plan_counterfactual` request. But most of the numbers can be reconstructed from three forecasts for the same plan version: the regular forecast, the counterfactual of the actual budget, and the counterfactual of the planned budget. **All three must share the same deployment and the same KPI** — a plan version can have forecast history across multiple deployments or KPIs, so don't just grab the first of each `altcast_type`; match them explicitly (see the code below).

| Metric | Source |
|---|---|
| Total Actual Outcome | Regular forecast's `predicted_outcome_summary_cusum` download, `mean` column, at the row for the counterfactual period's `end_date`. It's a *cumulative* sum, so this one row already is the total — no manual summing. |
| Forecast of Planned Budget (outcome) | Same technique, applied to the **planned** counterfactual's own `predicted_outcome_summary_cusum` at the counterfactual period's `end_date`. |
| Forecast of Actual Budget (outcome) | Same technique again, applied to the **actuals** counterfactual's own `predicted_outcome_summary_cusum` at the counterfactual period's `end_date`. Used only as an input to "In-sample Forecast Error" below, not surfaced on its own. |
| Total Actual Spend | Sum every spend + lower-funnel channel column in the **actuals** counterfactual's `form.budget`. Its rows are already confined to the counterfactual period, so no date filtering needed. |
| Total Planned Spend | Sum the same channel columns in the **planned** counterfactual's `form.budget`, filtered to dates up to (and including) the counterfactual period's `end_date` — this `form.budget` may span the plan's whole date range even though we only want the counterfactual-period subset. |
| Actual Observed ROI | Derived: Total Actual Outcome ÷ Total Actual Spend. |
| Forecasted Blended ROI | Derived: Forecast of Planned Budget ÷ Total Planned Spend. (Not read from `expected_blended_roi` — that field's date scoping wasn't confirmed to match the counterfactual period, so deriving it from the two period-consistent sums above is safer.) |
| In-sample Forecast Error | Derived: `(Total Actual Outcome − Forecast of Actual Budget) / Total Actual Outcome × 100`. The exact sign/denominator convention wasn't confirmed against the UI — verify before presenting this number to a client as authoritative. |

```python
import csv, io
from datetime import date

def parse_date(s):
    y, m, d = map(int, s.split("-"))
    return date(y, m, d)

def show_forecast(forecast_id):
    return requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts/{forecast_id}",
        headers=HEADERS,
    ).json()

def download_csv(forecast_id, key):
    resp = requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts/{forecast_id}/downloads/{key}",
        headers={**HEADERS, "Accept": "text/csv"},
    )
    return list(csv.DictReader(io.StringIO(resp.text)))

def cusum_value_at(forecast_id, target_date):
    rows = download_csv(forecast_id, "predicted_outcome_summary_cusum")
    row = next(r for r in rows if parse_date(r["date"]) == target_date)
    return float(row["mean"])

def sum_budget_channels(form_budget, channel_names, end=None):
    header = form_budget[0]
    date_idx = header.index("date")
    channel_idxs = [header.index(c) for c in channel_names if c in header]
    total = 0.0
    for row in form_budget[1:]:
        if end and parse_date(row[date_idx]) > end:
            continue
        total += sum(float(row[i]) for i in channel_idxs)
    return total

def deployment_id_of(detail):
    # Assumes a single-depvar KPI. Multi-depvar (aggregate) KPIs would need to
    # match on the full set of deployment_ids, not just the first one.
    return detail["results"][0]["depvars"][0]["deployment_id"]

# 1. Candidates for this plan version + KPI: the regular forecasts, and both
#    counterfactual kinds. Everything downstream is scoped to KPI_ID.
regular_candidates = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts",
    headers=HEADERS,
    params={"plan_version_id": version_id, "kpi_id": KPI_ID},
).json()["data"]
altcast_candidates = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts",
    headers=HEADERS,
    params={"plan_version_id": version_id, "kpi_id": KPI_ID, "altcast_types": "planned,actuals"},
).json()["data"]
planned_candidates = [f for f in altcast_candidates if f["altcast_type"] == "planned"]
actuals_candidates = [f for f in altcast_candidates if f["altcast_type"] == "actuals"]

# 2. Pick the most recent regular forecast, then match planned/actuals
#    candidates that share its deployment_id. Falls back to the most recent
#    planned/actuals pair if no exact deployment match is found.
regular_candidates.sort(key=lambda f: f["created_at"], reverse=True)
regular = regular_candidates[0]
regular_detail = show_forecast(regular["id"])
target_deployment_id = deployment_id_of(regular_detail)

def best_match(candidates):
    candidates = sorted(candidates, key=lambda f: f["created_at"], reverse=True)
    for c in candidates:
        detail = show_forecast(c["id"])
        if deployment_id_of(detail) == target_deployment_id:
            return c, detail
    # No exact deployment match — fall back to the most recent, but this pairing
    # may not be truly comparable to the regular forecast above.
    detail = show_forecast(candidates[0]["id"])
    return candidates[0], detail

planned, planned_detail = best_match(planned_candidates)
actuals, actuals_detail = best_match(actuals_candidates)

# 3. The counterfactual period comes directly from the actuals counterfactual's
#    own start_date/end_date (planned's should match).
period_start = parse_date(actuals_detail["start_date"])
period_end = parse_date(actuals_detail["end_date"])

# 4. Spend + lower-funnel channels, for summing form.budget below
version = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/versions/{version_id}",
    headers=HEADERS,
).json()
spend_channel_names = version["budget_summary"]["spend_channels"] + version["budget_summary"]["lower_funnel_channels"]

# ── Metric 1: Total Actual Outcome ────────────────────────────────────────────
total_actual_outcome = cusum_value_at(regular["id"], period_end)

# ── Metric 2: Forecast of the Planned Budget ──────────────────────────────────
total_planned_forecast = cusum_value_at(planned["id"], period_end)

# ── (input) Forecast of the Actual Budget, for the forecast-error metric ─────
forecast_of_actual_budget = cusum_value_at(actuals["id"], period_end)

# ── Metric 3: Total Actual Spend ──────────────────────────────────────────────
total_actual_spend = sum_budget_channels(actuals_detail["form"]["budget"], spend_channel_names)

# ── Metric 4: Total Planned Spend (filtered to the counterfactual period) ────
total_planned_spend = sum_budget_channels(
    planned_detail["form"]["budget"], spend_channel_names, end=period_end,
)

# ── Metric 5: Actual Observed ROI (derived) ───────────────────────────────────
actual_observed_roi = total_actual_outcome / total_actual_spend if total_actual_spend else None

# ── Metric 6: Forecasted Blended ROI (derived) ────────────────────────────────
forecasted_blended_roi = total_planned_forecast / total_planned_spend if total_planned_spend else None

# ── Metric 7: In-sample Forecast Error (derived) ──────────────────────────────
in_sample_forecast_error_pct = (
    (total_actual_outcome - forecast_of_actual_budget) / total_actual_outcome * 100
    if total_actual_outcome else None
)

print(f"Counterfactual period:       {period_start} to {period_end}")
print(f"Total Actual Outcome:        {total_actual_outcome}")
print(f"Forecast of Planned Budget:  {total_planned_forecast}")
print(f"Total Actual Spend:          {total_actual_spend}")
print(f"Total Planned Spend:         {total_planned_spend}")
print(f"Actual Observed ROI:         {actual_observed_roi}")
print(f"Forecasted Blended ROI:      {forecasted_blended_roi}")
print(f"In-sample Forecast Error %:  {in_sample_forecast_error_pct}")
```

This is a best-effort reconstruction, not a guaranteed match to the UI — it still doesn't call the UI's actual `compute_plan_counterfactual` request. The core metric calculations (the cusum technique for all three forecasts, the period-scoped spend summing, and the derived ROI/error formulas) were validated end-to-end against a live account and produced sane, self-consistent numbers. The deployment-matching candidate-selection logic above wasn't exercised in that same run (the forecasts were selected manually) — treat it as a reasonable first pass, not verified. The exact "In-sample Forecast Error" sign/denominator convention also hasn't been checked against the UI. Verify both against a real account with known UI values before treating this as fully authoritative.

### Scenario 10: Check spend adherence for a plan version

```python
reports = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/adherence",
    headers=HEADERS,
    params={"plan_version_id": version_id},
).json()["data"]

# A new report lands with each data refresh, so take the most recent successful
# one. An empty list is valid: no actual spend data for this period yet.
latest = next(
    (r for r in sorted(reports, key=lambda r: r["created_at"], reverse=True)
     if r["status"] == "success"),
    None,
)
if latest is None:
    raise SystemExit("No completed adherence report for this plan version yet.")

detail = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/adherence/{latest['id']}",
    headers=HEADERS,
).json()

h = detail["highlights"]
print(f"Through {detail['report_through_date']}: "
      f"planned={h['total']['planned_spend']}, actual={h['total']['actual_spend']}")

# spend_channels is an object of upper_funnel / lower_funnel lists, not an array.
for funnel, channels in h["spend_channels"].items():
    for c in channels:
        if c["planned_spend"] is None:  # lower funnel, not provided — actual only, never treat as 0
            print(f"[{funnel}] {c['channel_name']}: actual={c['actual_spend']} (no planned spend)")
        else:
            delta = (c["actual_spend"] or 0) - c["planned_spend"]
            print(f"[{funnel}] {c['channel_name']}: planned={c['planned_spend']}, "
                  f"actual={c['actual_spend']}, delta={delta}")

for d in detail["downloads"]:  # all-channels-adherence + {channel-name}-adherence; read, don't derive
    print(f"{d['key']} — {d['description']}")
```

Both sides are scoped to `report_through_date`, so these deltas are like-for-like. Label them as spend through that date, not as plan totals.

---

### Scenario 11: Check whether a Goal is on pace

```python
# 1. Find the goal. `status=current` means the model's data has reached the
#    goal's window — NOT that the window is open on the calendar.
goals = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/goals",
    headers=HEADERS,
    params={"per_page": 100},
).json()["data"]

if not goals:
    raise SystemExit("No goals set on this plan.")

goal = goals[0]
print(f"{goal['name']}: target {goal['goal_value']:,.0f} on {goal['kpi_label']} "
      f"({goal['start_date']} to {goal['end_date']}, status={goal['status']})")

# 2. forecast_id is the goal's latest forecast, so this is a single call —
#    goal highlights live on the show response, not on any list item.
detail = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts/{goal['forecast_id']}",
    headers=HEADERS,
).json()

# To walk the goal's history instead (how the projection shifted over time),
# list its forecasts and sort by created_at — list order is not guaranteed:
#   forecasts = requests.get(
#       f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/plans/{plan['id']}/forecasts",
#       headers=HEADERS, params={"goal_id": goal["id"], "per_page": 100},
#   ).json()["data"]
#   history = sorted(forecasts, key=lambda f: f["created_at"], reverse=True)

h = detail["goal_highlights"]
verb = "ahead of" if h["pacing"] >= 0 else "behind"
print(f"Projected {h['projected']:,.0f} — {abs(h['pacing']):,.0f} {verb} target, "
      f"{h['success_probability'] * 100:.0f}% chance of hitting it")

kpi, spend, roi = h["details"]["kpi"], h["details"]["spend"], h["details"]["blended_roi"]
if kpi["so_far"] == 0:
    print("Nothing realized yet — the goal's window is still beyond the model's data.")
else:
    print(f"KPI so far {kpi['so_far']:,.0f} of {kpi['projected']:,.0f} projected")

# blended_roi members are None where the matching spend is 0 — ROI is undefined,
# which is not the same as 0.
if roi["projected"] is None:
    print(f"Projected spend {spend['projected']:,.0f}; blended ROI not applicable yet")
else:
    print(f"Projected spend {spend['projected']:,.0f} at {roi['projected']:.2f}x blended ROI")
```

---

## Common Mistakes to Avoid

1. **Calling `GET /plans/{plan_id}/versions/{version_id}/forecasts`** — This path doesn't exist. Forecasts are only accessible via `GET /plans/{plan_id}/forecasts`, filtered with the `plan_version_id` query param to narrow to one version.

2. **Trying to fetch a version by ID alone** — Version show requires the full path with `plan_id` included: `/plans/{plan_id}/versions/{id}`. There's no top-level `/plan_versions/{id}` shortcut.

3. **Expecting daily budget numbers from the version show endpoint** — `version["budget"]` there is channel *metadata* (names only). Use the dedicated `/budget` CSV endpoint for actual daily values.

4. **Treating `include_lower_funnel_effects`-style string booleans as a pattern here** — Plans endpoints use real JSON booleans (`primary: true`) and real numbers (`total_spend: 1250000.0`), unlike some Reporter/Optimizer form fields that require string-typed booleans/numbers. Don't stringify Plans values.

5. **Computing a Goal's `status` from today's date** — Goal status is relative to the last date of data the model has, not to the calendar. A Goal whose window has already opened can legitimately still be `future`, and "correcting" it client-side puts you out of step with both the API and the UI. Related: don't invent a `/goals/{id}` show endpoint (it 404s) — a Goal's detail comes from `GET /plans/{plan_id}/forecasts?goal_id={goal_id}` and then showing that forecast.

6. **Expecting a single combined counterfactual object** — There is no "planned vs. actual" comparison payload. A plan version's counterfactuals are two ordinary Forecast results — one with `altcast_type: "planned"`, one with `altcast_type: "actuals"` — in the same forecasts list as the plan's regular forecast (which has `altcast_type: null`). Fetch both and diff them yourself if you want a comparison.

7. **Treating counterfactuals as forward-looking** — They're retroactive: a re-forecast of already-elapsed (in-sample) days using the current, latest model. Don't use them to predict future performance; that's what the plan's regular forecast (`altcast_type: null`) is for.

8. **Expecting `results` on a forecasts-list item** — `PlanForecastSummary` (from the list endpoints) is a summary only; it has no `form` or `results`. You must call the show endpoint (`GET /plans/{plan_id}/forecasts/{forecast_id}`) for each forecast you need outcome data from.

9. **Assuming Plans is read-only, or that create only works from an optimization** — Both are stale. `POST /plans` takes either `{optimization_id, label}` *or* a full from-scratch form, and `POST /plans/{plan_id}/versions` edits a plan by adding a version. What genuinely isn't in the API: renaming and deleting a plan or version (both UI-only). And re-pointing the primary version at an older version isn't possible anywhere, so don't send clients to the UI for it — a "revert" is a new version carrying the old numbers. On the optimization path specifically, fields beyond `optimization_id`/`label` still aren't accepted and can't override a derived value.

10. **Not handling `null` on `status`, `label`, `total_spend`** — Several fields are nullable (a version can have no dates and thus no derived status). Guard for `None`/`null` before using these values. `primary_version`, by contrast, is never `null` — every plan has one.

11. **Using `altcast` or `kpi` as query param names** — They're silently ignored (200 with the unfiltered set, no error). The correct names are `altcast_types` and `kpi_id`. See Known API Quirks.

12. **Assuming a counterfactual forecast's numbers match the UI's Counterfactual section** — They won't. Even accounting for the different `start_date`/`end_date` scoping altcasts use, engineering has flagged that the result values can reflect a broader combined computation than the UI's Counterfactual section shows, which gets its numbers from a separate, unexposed `compute_plan_counterfactual` request.

13. **Assuming `expected_roi` means "Expected Blended ROI," or confusing it with `expected_observed_paid_roi`** — It used to mean blended ROI (and `paid_roi` used to exist). Today, `expected_roi` and `expected_observed_paid_roi` are both **paid** ROI (not blended with baseline/organic) — they differ only in time window: `expected_observed_paid_roi` is windowed, `expected_roi` counts outcome the spend causes whether it lands during or after the window. `expected_blended_roi` is a separate, windowed-and-blended figure. `paid_roi` is gone, and `total_forecasted_spend` was added. If you see older code or examples using `paid_roi`, they're stale.

14. **Assuming `start_date`/`end_date` bound the forecast's entire daily output** — They don't, and the gap works in opposite directions depending on the forecast kind. A regular forecast's daily output can extend *earlier* than `start_date` (those dates are actuals, not forecast). A "planned" counterfactual's daily output extends *later* than `end_date` (that continuation is a regular forward forecast of the planned budget). Only the actuals counterfactual has its daily output fully bounded by `start_date`/`end_date`.

15. **Confusing adherence with counterfactuals** — Adherence compares planned vs. actual **spend** (an input audit, no modeling); counterfactuals compare modeled **outcomes**. "Are we on budget?" → adherence. "What did going off-plan cost us in revenue?" → counterfactuals. See the Adherence endpoint section for its other gotchas: empty index, `null` planned spend, no `nonspend_channels`.

16. **Assuming a "planned" counterfactual's future segment matches the plan's regular forecast for the same dates** — It might not. The counterfactual's forward segment carries over prior spend from its own retroactive replay of the planned budget; the regular forecast carries over from real actual spend. Different upstream history can produce different downstream numbers.

17. **Carrying budget semantics across the two write endpoints** — They differ. On `POST /plans` the table is the whole budget and must cover every day of the range. On `POST /plans/{plan_id}/versions` it is a sparse patch: omitted channels, dates and contextual variables are all inherited from the base version. Two failure modes fall out of this: sending a full table to *create* something you only meant to tweak is fine but noisy, while assuming a version budget replaces (and so padding it with zeros for the channels you didn't want to change) actively zeroes those channels. Send only what you mean to change. Note also that a version budget cannot remove a channel at all — `0` zeroes the spend but the channel stays in `budget_summary.spend_channels`.

18. **Reusing a `base_version_id`, or reading it long before the write** — It must be the plan's *current* primary version at the moment of the request, and every successful write invalidates it (the new version becomes primary). Re-read `primary_version.id` immediately before each POST. Chaining two edits with the same base gets you a 201 then a 409.

19. **Treating a 409 as a validation failure, or a missing `base_version_id` as a 409** — They mean opposite things. A **409** means "someone else saved first" → re-read the primary version, re-apply, resend; its body has `error.message` only, no `details`. A **400** means the parameter is absent (missing, `null`, or `""`) → the request is malformed. An unknown UUID and a malformed non-UUID both land on 409, not 404; another plan's version id can come back as either 409 or 404.

20. **Offering to rename a version, change a plan's dates, or set an older version primary** — None of these exist. `PlanVersionCreateForm` accepts only `budget`, `lower_funnel_channel_caps`, `spike_type`, `depvar_spike_groups`; `label`/`start_date`/`end_date` are rejected with 422. Version labels are auto-generated, and a different date range means a new plan. Renaming and deleting are UI-only, but **don't send a client to the UI to make an old version primary again** — that isn't possible there either. The primary flag only moves forward; a revert is a new version carrying the old version's numbers.

21. **Enumerating channels from `GET /deployments?active=true`** — That's the discovery trap. The plan form's channel universe is the deployments backing the client's **KPIs**; an active deployment that backs no KPI advertises channels `POST /plans` rejects as unknown, blaming `budget`. Go via `GET /kpis` → `depvars[].slug` → the deployments whose `dashboard_slug` matches.

22. **Computing the plan's latest allowed end date from the newest model** — It's derived from the **earliest-ending** KPI-linked model plus 730 days. A client with one stale KPI-linked model can have a limit in the past, meaning no future-dated plan is possible at all. Compute `min(end_date) + 730 days` across KPI-linked deployments, not `max`.

23. **Trusting a 201 to mean the plan is forecastable** — `compatible_kpis` is only populated when the budget covers all of a model's channels (spend *and* non-spend), so a thin budget creates a plan no KPI can forecast, with no warning in the response. Always read the version back and check what actually landed.

24. **Reading a blank budget cell as "no value"** — It's coerced to `0` on both endpoints, not rejected. A cell the caller forgot to fill is indistinguishable from a deliberate zero, and nothing downstream flags it. Validate the table before sending.

25. **Assuming a version budget has to cover the full range, or be in date order** — Neither is true; both are create-only rules. A version patch may name one day and one channel, in any order. What it may *not* do is name a date outside the base version's range — including a table that mixes one in-range row with one out-of-range row, which is rejected wholesale rather than partially applied.

---

## Known API Quirks (current dev environment)

- **Malformed (non-UUID) `plan_id` handling is now correct.** An earlier version of this doc reported 503 for a malformed id; as of 2026-08-27 both a malformed id and a well-formed non-existent UUID return the documented **404** on the versions and goals paths. Treat 404 as the expected answer for a bad id.

- **An out-of-range page reports `pagination.per_page: 0`** on the goals and plan-forecasts indexes (the plans index is unaffected). The field mirrors the number of rows returned rather than the page size once you page past the end. Don't use `per_page` from the response to drive a pagination loop — use `total_pages`/`total_count`, or stop when `data` comes back empty.

- **Goal `status` is derived from the model's data end date, not the current date.** Verified: a Goal running 2026-08-01 to 2026-08-31 reports `future` on 2026-08-26 because the model has data through 2026-07-04, and `status=current` correctly returns nothing for it. This is intended behavior, not a bug — but it means a `status=current` filter answers "what is being tracked against real data", which is not the same question as "what is running right now on the calendar".

- **The goal target field was renamed to `goal_value`** as of 2026-08-27 (the original API spec said `value`). Older examples using `goal["value"]` are stale.

- **`goal_id` belongs to the plan-scoped forecasts index only.** On `GET /plans/{plan_id}/forecasts` it filters properly, and an unknown goal returns 404 rather than an unfiltered list. The top-level `GET /forecasts` index does not accept it and will ignore it — and it could not work there anyway, since plan and goal forecasts are a separate collection that the top-level index never returns.

- **An empty-string `label` on `POST /plans` is treated as missing, not invalid** — it returns **400** with `"Missing required parameter: label"`, not the 422 you might expect for a validation failure. Consistent across clients. If you're distinguishing "you forgot a field" from "your value is bad," `label: ""` lands in the first bucket.

- **Unrecognized query params on `GET /plans/{plan_id}/forecasts` are silently ignored, not rejected.** This isn't a bug, but it's a real trap: a wrong param name looks exactly like a working-but-empty filter, since the request still returns 200 with the unfiltered set. Two names that are easy to get wrong: the counterfactual filter is `altcast_types` (plural), not `altcast`; the KPI filter is `kpi_id`, not `kpi`. If a filter you're using seems to have no effect, double-check the exact param name before assuming the API is broken (an earlier version of this doc mistakenly reported `altcast` filtering as a server-side no-op — it was actually just the wrong param name).

- `altcast_types` **is a swap, not an additive filter, and it validates its value.** Omit the param entirely to get only the plan's regular, forward-looking forecasts (counterfactuals are excluded by default). Pass it to get *only* counterfactuals of the requested kind(s) instead — there's no single call that returns regular and counterfactual forecasts mixed together. Passing a blank value or an unrecognized string returns **422**, not a silent no-op.

- **Writes are rate limited, with no `Retry-After` header.** A burst of creates starts drawing **429** with a "Retry later" body. Roughly 20 writes/minute is safe. If you generate a script that makes more than a handful of creates, throttle it and retry through 429 (and 503) with a fixed backoff — otherwise a rate limit reads as a validation failure.

- **A non-array `lower_funnel_channel_caps` on `POST /plans` is silently discarded, not rejected.** The caps shape validator only runs once the value is an array, so `"lower_funnel_channel_caps": "off"` returns **201** and the channel falls through to its omission default (manual if it has a budget column, uncapped otherwise). The caller gets no sign their settings were dropped. One level in, the check does fire: an array containing an empty object, or a single cap object sent instead of an array, both 422. Validate the field is a list before sending.

- **A non-object `form` currently 500s** on both write endpoints (`{"form": "not-an-object"}`, or `form` as an array on the version endpoint). The type check reaches `form`'s fields but not `form` itself. It should be a 400/422; don't report a 500 here to the client as a server outage.

- **An empty `form: {}` on the version endpoint is a 400, not a 201.** A no-change diff is treated as an absent parameter rather than minting an identical version. There is no way to "touch" a plan into a new version without changing something.

- **A non-spend channel omitted from a from-scratch budget is absent from the plan**, not predicted for you. The Plans-creation QA checklist says it "should be predicted by spend forecast" — the API doesn't do that today. Contextual variables *do* fall back to a model default; non-spend channels don't. If the client wants a non-spend channel in the plan, give it a column.

- **The plan's latest allowed `end_date` comes from the earliest-ending KPI-linked model.** Verified on a client with models ending 2023-08-06 and 2025-06-22: the API reports "can't be after 2025-08-05" — the *earlier* model's end plus 730 days. Clients whose oldest KPI-linked model stopped years ago cannot take a future-dated plan at all.

- **The channel universe is the KPI-linked deployments, not the recent ones.** KPI-linked deployments with different data end dates all contribute valid channels; what's refused is a channel belonging to an active deployment that backs no KPI. Deployment recency is not the rule.

---

## Code Generation Rules

**General:**
- Load the PAT from an environment variable: Python uses `os.environ["RECAST_PAT"]`, R uses `Sys.getenv("RECAST_PAT")`. Teach the user how to set their own environment variable.
- NEVER print, log, or display the token.
- Base URL: `https://api.getrecast.com`
- Auth: Bearer token in the Authorization header.
- Two `POST` endpoints exist: `POST /plans` (from an optimization, or from scratch) and `POST /plans/{plan_id}/versions` (edit a plan by adding a version). Never generate `PATCH`/`PUT`/`DELETE` against `/plans` — they don't exist, and there is no way to delete a plan or version at all.
- **Writes leave permanent state.** There's no DELETE, so say so before generating a create, and label exploratory plans identifiably (prefix + timestamp).
- **On an edit, send only the cells that change.** The version budget is a patch — don't pad it with the channels you aren't touching, and never pad with zeros. Fetch the base version's budget CSV first only when the edit is relative to current values. Print the resulting `total_spend` so an unintended change is visible.
- **Always re-read `primary_version.id` immediately before a version POST**, and handle 409 by re-reading and retrying rather than by failing or by resending the same base id. Cap the retries.
- **Surface `error.details` on a 422** — it's keyed by the offending field, which is the only actionable part of the response. Don't collapse it to a generic "validation failed".
- **Throttle write loops** (~20/min) and retry through 429/503; write rate limits carry no `Retry-After`.
- On the optimization create path, don't attempt to override any derived value — only `optimization_id` and `label` are accepted.
- Set `Accept: text/csv` explicitly when downloading a version's budget.
- Include error handling that shows the response body on non-200 responses.

**Python specific:**
- Use `requests` and `pandas`
- Use f-strings for URL construction
- Parse CSV with `pd.read_csv(io.StringIO(resp.text))`

**R specific:**
- Use `httr2` and `jsonlite`
- Use pipe `|>` syntax
- Parse responses with `resp_body_string() |> fromJSON(simplifyVector = FALSE)`
- Use `req_error(is_error = \(resp) FALSE)` to handle errors manually

---

## API Reference

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/clients/{client_slug}/plans` | Create a plan — either from a successful optimization (`form: {optimization_id, label}`) or from scratch (`form: {label, start_date, end_date, budget, ...}`). Synchronous, no polling. Returns `{id}` only |
| POST | `/v1/clients/{client_slug}/plans/{plan_id}/versions` | Edit a plan by adding a version: `{base_version_id, form}` where `form` accepts only `budget`, `lower_funnel_channel_caps`, `spike_type`, `depvar_spike_groups`. The new version becomes primary; 409 if `base_version_id` isn't the current primary |
| GET | `/v1/clients/{client_slug}/plans` | List plans (paginated: `?page=1&per_page=25`; filters: `plan_type`, `label`, `status`, `kpi_ids`, `created_by`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/versions` | List a plan's versions (paginated, same as the Index) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/versions/{id}` | Show full version detail |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/versions/{id}/budget` | Download the budget as CSV (`Accept: text/csv`; optional `granularity` = `total`/`monthly`/`weekly`/`daily`, `start_date`, `end_date`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/forecasts` | List forecasts across every version of the plan (filters: `kpi_id`, `plan_version_id`, `goal_id`, `altcast_types`; counterfactuals have `altcast_type` of `"planned"` or `"actuals"`, regular forecasts have `altcast_type: null`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/forecasts/{forecast_id}` | Show a single plan-linked forecast |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/forecasts/{forecast_id}/downloads/{key}` | Download a CSV for one of the forecast's results (optional `start_date`, `end_date` on downloads with a date column) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/adherence` | List adherence reports across every version of the plan (paginated; optional filter: `plan_version_id`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/adherence/{id}` | Show one adherence report (`id` = the report's id): planned vs. actual spend highlights + downloads |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/adherence/{id}/downloads/{key}` | Download an adherence CSV: `all-channels-adherence` or `{channel-name}-adherence` |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/goals` | List a plan's Goals (paginated; filters: `kpi_id`, `status`) |

There is no Goal show endpoint, no `PATCH`/`PUT`, and no `DELETE` anywhere in the Plans API. Renaming and deleting a plan or version are UI-only. Editing a plan's inputs is done by creating a new version, which is also the only way the primary flag moves — it never moves backwards, in the API or the UI.

### Index response

```json
{
  "data": [ /* PlanSummary items */ ],
  "pagination": { "page": 1, "per_page": 25, "total_pages": 3, "total_count": 52 }
}
```

Filter examples: `?plan_type=custom`, `?label=Growth`, `?status=current,expired`, `?kpi_ids=d66d6adb-1d17-40cc-9bc7-f4bc6c78ec2e`, `?kpi_ids=d66d6adb-1d17-40cc-9bc7-f4bc6c78ec2e,1e1df8b4-2efc-4914-898d-8cbda72642b3` (or `?kpi_ids[]=...&kpi_ids[]=...`), `?created_by=user@example.com`, `?created_by=user@example.com,Recast`.

### Versions-list response

```json
{
  "data": [ /* PlanVersionSummary items */ ],
  "pagination": { "page": 1, "per_page": 25, "total_pages": 1, "total_count": 3 }
}
```

### Version-show response

Returned directly (no wrapper) — see PlanVersionDetail schema above.

### Budget response

`text/csv` body: one column per channel in the version's `budget_summary` metadata, preceded by either a `date` column (daily, or no `granularity` param) or `start_date` + `end_date` columns (`total`, `monthly`, `weekly`).

Filter examples: `?granularity=monthly`, `?granularity=total`, `?start_date=2026-07-01&end_date=2026-09-30`, `?granularity=weekly&start_date=2026-07-01`.

---

## Glossary

| Client says | API field / action |
|---|---|
| "turn this optimization into a plan", "save this optimization as a plan" | `POST /plans` (`form.optimization_id`, `form.label`) — requires the optimization's `status` to be `success` |
| "build a plan", "create a plan from scratch", "make a plan from this budget" | `POST /plans` with the from-scratch form (`label`, `start_date`, `end_date`, `budget`, optional caps/spikes) |
| "edit the plan", "change the budget", "save a new version" | `POST /plans/{plan_id}/versions` (`base_version_id` + a `form` diff) |
| "base version", "the version I'm editing from" | `base_version_id` — must equal the plan's current `primary_version.id`, or you get a 409 |
| "someone else changed it", "conflict", "stale" | The 409 on `POST /plans/{plan_id}/versions` — re-read the primary version and re-apply |
| "provided spend" (lower funnel) | `option: "manual"` in `lower_funnel_channel_caps`, and the channel needs its own budget column |
| "just change this one number" | A version budget is a sparse patch — send `date` plus the one column, only the rows you're changing |
| "rename the plan", "delete this version" | Not in the API — UI only |
| "make v2 primary", "revert to the previous version" | Not possible in the API or the UI — post the old version's numbers as a new version |
| "plan", "media plan" | A Plan resource, `GET /plans` |
| "live version", "current version" | `primary_version` (Index) / `primary: true` (versions list/show) |
| "version history", "past versions" | `GET /plans/{plan_id}/versions` |
| "budget", "daily spend plan" | `GET /plans/{plan_id}/versions/{id}/budget` (CSV) — NOT the `budget_summary` field on version show, which is metadata only |
| "monthly budget", "budget by month" | Same endpoint with `granularity=monthly` — first columns become `start_date`,`end_date` |
| "goal", "target" | A Goal resource, `GET /plans/{plan_id}/goals` |
| "am I on track for my goal", "pacing" | `goal_highlights.pacing` / `goal_highlights.success_probability` on the Goal's forecast show response |
| "channels in this plan" | `budget.spend_channels` / `non_spend_channels` / `contextual_variables` / `lower_funnel_channels` on version show |
| "branded search cap", "lower funnel setting" | `lower_funnel_channel_caps` |
| "promotions", "holidays baked into the plan" | `depvar_spike_groups` |
| "can this plan forecast X KPI?" | `compatible_kpis` / `incompatible_kpis` on version show |
| "plan type", "default vs custom" | `plan_type` |
| "is this plan active?" | `status` (`current`/`future`/`expired`) |
| "plan forecast", "counterfactual", "altcast" | `GET /plans/{plan_id}/forecasts` (filter with `plan_version_id` for one version) — counterfactuals are the entries with a non-null `altcast_type` |
| "goal", "target" | A Goal resource, `GET /plans/{plan_id}/goals` |
| "pacing", "success probability", "am I on track for my goal" | `goal_highlights` on the Goal's latest forecast — show the goal's `forecast_id` |
| "adherence", "am I on budget", "spend to date", "planned vs actual spend" | `GET /plans/{plan_id}/adherence` (filter with `plan_version_id`) — `highlights` on the show response; `report_through_date` is how current it is |

## Resources

If the client wants to find or run the source optimization for a Create call, see the **optimizer-api** skill.

If the client asks for something not covered here:
- https://docs.getrecast.com/docs/plans
- https://docs.getrecast.com/docs/forecast-the-performance-of-a-plan
- https://docs.getrecast.com/docs/track-the-impact-of-a-plan#Adherence
- https://docs.getrecast.com/docs/recommendations
