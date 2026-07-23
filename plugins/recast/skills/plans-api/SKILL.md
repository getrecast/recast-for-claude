---
name: plans-api
description: Use when reading Recast Plans programmatically — "list my plans", "get a plan's budget", "pull a plan's forecast", "what changed between these two plan versions", "get counterfactual forecasts for this plan". Translates plan-reading goals into API requests for retrieving plans, versions, budgets, and forecasts/counterfactuals. This is read-only — plans are created and edited in the UI, not via this API.
---

# Recast Plans API — Reading Plan Configuration and Budgets

You are helping a Recast client read data out of their **Plans** (the Plans tab of the app) programmatically. Unlike the Optimizer, Forecaster, and Reporter APIs, **Plans has no create or update endpoint yet** — plans are built and edited in the UI. If the client wants to create a new Plan, point them to the UI (https://docs.getrecast.com/docs/plans); once it exists there, it's readable through this API. Your job is entirely about retrieval: finding the right plan, the right version, and the right data (config, budget, forecast) to pull.

**Base URL:** `https://api.getrecast.com`
**All endpoints are under** `/v1/clients/{client_slug}/plans`.

---

## Conversation Flow

### 1. Gather context

Ask the client what they're trying to get, naturally (one or two at a time):

- **Which plan?** Do they know the plan's label (from the Plans tab) or its `id` (from the URL)? If not, they want to browse/filter the index.
- **Which version?** Almost always the **primary version** (the live, current one) — this is included directly on each plan in the Index response, so a separate versions call is often unnecessary. Only fetch the versions list if they want history or a specific past version.
- **What data?**
  - Configuration only (channels used, spike groups, lower funnel caps, compatible KPIs) → version show
  - The actual daily numbers → version budget (CSV)
  - How the plan is forecasted to perform going forward → the plan's regular forecast (`altcast_type: null`)
  - How the current model retroactively evaluates the plan's budget vs. what was actually spent, over days that have already elapsed → counterfactuals (`altcast_type: "planned"` / `"actuals"`)

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
| **Plan Version** | A snapshot of a Plan. Every edit in the UI creates a new version. Only the **primary version** (`primary: true`) is live/editable; others are historical. |
| **plan_type** | `default` (auto-generated, refreshed every model update, assumes future spend follows historical patterns, 730-day window) or `custom` (user-built). |
| **status** | Derived, not stored: `future` / `current` / `expired`, based on today's date vs. the plan or version's start/end dates. Can be `null`. |
| **Budget metadata vs. budget data table** | The version show endpoint returns only the channel *names* used (`spend_channels`, `non_spend_channels`, `contextual_variables`, `lower_funnel_channels`). The actual daily values are a separate CSV download — it can be large, so it's not embedded in the JSON detail. |
| **Lower funnel channel caps** | Per lower-funnel-channel setting: `uncapped` (predicted from upper funnel), `capped` (max spend for the period), `off` (excluded), or `manual` (fixed values). **Quirk:** the app UI labels this option "provided" — the API returns `manual` for it. If a client asks about "provided" spend, look for `option: "manual"`. |
| **Spike / depvar spike groups** | Named promotional/holiday events, each tied to one or more depvars (the model components of a KPI) and dates. |
| **compatible_kpis / incompatible_kpis** | Which KPIs this version's inputs can and can't forecast. A KPI is incompatible when the plan is missing a channel/spike/contextual variable the model needs. |
| **Counterfactual / altcast_type** | A *retroactive* re-forecast of already-elapsed (in-sample) days, using the **current/latest model** rather than whatever model existed at the time — not a forward-looking prediction. Not a single comparison object either — two separate ordinary Forecast results, distinguished by `altcast_type`: `null` (the plan's regular, forward-looking forecast), `"planned"` (what the current model predicts the plan's **originally specified budget** would have produced over those historical days), or `"actuals"` (what the current model predicts the **actual spend** that occurred would have produced). No combined "planned vs. actual" payload; diffing the two is a client-side exercise. |
| **Recommendations** | Suggested budget reallocations to improve a forecasted outcome, at Conservative / Moderate / Aggressive risk levels. Available on all Forecasts associated with a Plan (see the forecaster-api skill for the `run_recommendations` flag). |

---

## Recommended Workflow (Template-First)

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

## The Endpoints

### Index — `GET /v1/clients/{client_slug}/plans`

Paginated list of plans. **Wrapped**: payload is in `response["data"]`, with a `pagination` object.

Query params (all optional): `page` (default 1), `per_page` (default 25, max 100), `plan_type` (`default`|`custom`), `label` (partial, case-insensitive match), `status` (`expired`|`current`|`future`, comma-separated for multiple e.g. `status=current,expired`), `kpi_ids` (one or more UUIDs — plans whose primary version is compatible with any of these KPIs; comma-separated `kpi_ids=id1,id2` or repeated `kpi_ids[]=id1&kpi_ids[]=id2`), `created_by` (one or more emails, or `Recast` for system-generated plans; comma-separated or repeated, same multi-value convention as `status`/`kpi_ids`).

### Version list — `GET /v1/clients/{client_slug}/plans/{plan_id}/versions`

Paginated, same as the Index. Ordered by `created_at` descending; exactly one item has `primary: true`.

### Version show — `GET /v1/clients/{client_slug}/plans/{plan_id}/versions/{id}`

Returned directly, no wrapper. Requires all three identifiers: `client_slug`, `plan_id`, and the version `id` — you cannot fetch a version by its ID alone.

### Version budget — `GET /v1/clients/{client_slug}/plans/{plan_id}/versions/{id}/budget`

Returns CSV, not JSON. Set `Accept: text/csv`. First column is `date`; remaining columns are the channels from the version's `budget_summary` metadata (spend + non-spend + contextual variables + lower funnel channels combined).

### Plan forecasts & counterfactuals — `GET /v1/clients/{client_slug}/plans/{plan_id}/forecasts`

Plan-driven forecasts are nested under the plan, rather than exposed as query params on the general `/forecasts` endpoint. There is no separate version-scoped forecasts path — filtering to one version happens via a query param on this same endpoint. Each entry carries an ordinary Forecast `form`/`results` shape (see the forecaster-api skill), plus plan-specific fields: `plan_id`, `plan_label`, `plan_version_id`, `plan_version_number`, `kpi_id`, `kpi_label`, and `altcast_type`.

- `GET /plans/{plan_id}/forecasts` — forecasts across every version of the plan. Supports `kpi_id` and `plan_version_id` query filters (pass `plan_version_id` to narrow to one specific version). **Counterfactual (altcast) forecasts are excluded unless requested.** Omitting `altcast_types` returns only the plan's regular, forward-looking forecasts. Passing `altcast_types` (one or more of `planned`/`actuals` — multi-value via `altcast_types=planned,actuals` or `altcast_types[]=planned&altcast_types[]=actuals`, matching the `status`/`kpi_ids` convention elsewhere) switches to *only* counterfactuals of those kinds — it replaces the regular-forecasts result, it doesn't add to it. A blank or unrecognized value returns 422. Goal forecasts are never exposed by these endpoints.
- `GET /plans/{plan_id}/forecasts/{forecast_id}` — show a single forecast from a particular plan version
- `GET /plans/{plan_id}/forecasts/{forecast_id}/downloads/{key}` — download a CSV for one of the forecast's results

The human-readable label field (e.g. `"v3"`) is named differently across endpoint families. On the Index, Version list, and Version show endpoints it's `version_number`. On these Forecast endpoints, the version is referenced by two separate fields instead: `plan_version_id` (the version's actual UUID) and `plan_version_number` (the human-readable label). This is intentional (confirmed with engineering) — on a forecast object, an unqualified "version_number" would be ambiguous about which resource's version it means, so the forecast endpoints spell out `plan_version_number`. Don't assume the field name carries over between the two families.

**Counterfactuals** are retroactive re-forecasts, not forward-looking predictions: they take days that have already elapsed (in-sample) and ask what the plan's **current, latest model** would predict for them — as opposed to the plan's regular forecast, which looks forward. They are not a separate comparison endpoint either — they show up as ordinary entries in that same forecasts list, distinguished by `altcast_type`: `null` (the plan's regular, forward-looking forecast), `"planned"` (the current model's retroactive prediction of the outcome from the plan's **originally specified budget**), or `"actuals"` (the current model's retroactive prediction of the outcome from the **actual spend** that occurred). Each plan version has two counterfactual entries (one `"planned"`, one `"actuals"`). The API does not return the richer comparison view (highlight tiles, charts) shown in the UI's Counterfactual section — just these two underlying forecasts. If the client wants a planned-vs-actual comparison, that means fetching both and diffing them client-side. The `altcast_types` query filter takes the same values (`altcast_types=planned` / `altcast_types=actuals`, or both comma-separated).

**What each forecast's daily output actually covers, and what `start_date`/`end_date` mean.** This is the single most important nuance in this API — get it wrong and every downstream number gets misread. It's different for each of the three forecast kinds:

- **Regular forecast** (`altcast_type: null`): `start_date`/`end_date` describe only the forward-looking, actually-forecasted window. The daily output can extend earlier than `start_date` — those earlier dates are real historical actuals, not forecast. Only `start_date`–`end_date` is genuinely predicted.
- **Counterfactual of actuals** (`altcast_type: "actuals"`): fully retroactive. `start_date`/`end_date` exactly bound the dates where a complete actual budget exists across every included channel, and the *entire* daily output over that range is counterfactual — nothing forward-looking mixed in.
- **Counterfactual of planned budget** (`altcast_type: "planned"`): `start_date`/`end_date` cover *only* the retroactive portion (same date-availability rule as the actuals counterfactual above), even though the plan has a budget specified for its whole date range. The rest of the plan period, after `end_date`, is filled in by a regular forward forecast of the planned budget — and that continuation **is part of the daily output**, just not labeled by `start_date`/`end_date`. So the full result answers "what if I'd followed the planned budget exactly, past and future," and aggregate metrics like `expected_outcome` are computed over that whole combined range, not just the labeled window. That's the actual mechanism behind the UI mismatch, more precise than "it's a larger problem than the date fields."

**Gotcha:** the forward-looking segment of a "planned" counterfactual can differ numerically from calling the plan's separate regular forecast for the same future dates. The model carries over prior spend (adstock/carryover) from different inputs in each case — the "planned" counterfactual carries over from its own retroactive replay of the planned budget, the regular forecast carries over from real actual spend. Don't assume they'll match.

**Critical limitation — these still don't match the UI's Counterfactual section.** The UI gets its numbers from a separate internal `compute_plan_counterfactual` request that this API does not expose, and there's no way to trim or reconcile a counterfactual forecast's response to match it. Tell the client this API's counterfactual forecasts are directionally useful but won't reproduce the UI's Counterfactual section numbers exactly. A dedicated endpoint for that summarized view may ship in the future.

---

## Response Envelope Reference

| Endpoint | Wrapper |
|---|---|
| `GET /plans` | `{"data": [...], "pagination": {...}}` |
| `GET /plans/{plan_id}/versions` | `{"data": [...], "pagination": {...}}` |
| `GET /plans/{plan_id}/versions/{id}` | Returned directly, no wrapper |
| `GET /plans/{plan_id}/versions/{id}/budget` | CSV body, not JSON |

---

## Schema Reference

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

This is a recent fix. Older responses / older code you might see referenced elsewhere used only `expected_outcome`, `expected_roi`, and `paid_roi` — with `expected_roi` back then actually holding the "Expected Blended ROI" value, and no field at all for the UI's distinct "Expected ROI" or "Total Forecasted Spend." If you're generating code, always use the current field names above and the mapping table, not any older `paid_roi`-based examples you might find.

**Each of the four fields above also has a companion `_quantiles` object** — `expected_outcome_quantiles`, `expected_blended_roi_quantiles`, `expected_observed_paid_roi_quantiles`, `expected_roi_quantiles` — each shaped `{"median": number, "p25": number, "p75": number}`. The point-estimate field (e.g. `expected_roi`) and its `_quantiles.median` aren't necessarily identical; use whichever the client actually wants (a single point estimate vs. an uncertainty range).

---

## Translating Client Asks to API Calls

| Client says | What to do |
|---|---|
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
| "What's my Goal pacing on this plan?" | Not available — Goals are excluded from this API release entirely |

---

## Common Scenarios with Full Examples

### Scenario 1: List current plans and their total spend

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

### Scenario 2: Pull the primary version's full config for a named plan

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

### Scenario 3: Download the budget CSV for the primary version

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

### Scenario 4: Compare total_spend across all versions of a plan

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

### Scenario 5: Pull a plan version's forecast, plus its planned-vs-actual counterfactuals

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

### Scenario 6: Reconstruct the UI's Counterfactual summary (planned vs. actual)

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

---

## Common Mistakes to Avoid

1. **Calling `GET /plans/{plan_id}/versions/{version_id}/forecasts`** — This path doesn't exist. Forecasts are only accessible via `GET /plans/{plan_id}/forecasts`, filtered with the `plan_version_id` query param to narrow to one version.

2. **Trying to fetch a version by ID alone** — Version show requires the full path with `plan_id` included: `/plans/{plan_id}/versions/{id}`. There's no top-level `/plan_versions/{id}` shortcut.

3. **Expecting daily budget numbers from the version show endpoint** — `version["budget"]` there is channel *metadata* (names only). Use the dedicated `/budget` CSV endpoint for actual daily values.

4. **Treating `include_lower_funnel_effects`-style string booleans as a pattern here** — Plans endpoints use real JSON booleans (`primary: true`) and real numbers (`total_spend: 1250000.0`), unlike some Reporter/Optimizer form fields that require string-typed booleans/numbers. Don't stringify Plans values.

5. **Assuming Goals are queryable** — They are explicitly excluded from this API release. Don't guess at a `/goals` endpoint.

6. **Expecting a single combined counterfactual object** — There is no "planned vs. actual" comparison payload. A plan version's counterfactuals are two ordinary Forecast results — one with `altcast_type: "planned"`, one with `altcast_type: "actuals"` — in the same forecasts list as the plan's regular forecast (which has `altcast_type: null`). Fetch both and diff them yourself if you want a comparison.

7. **Treating counterfactuals as forward-looking** — They're retroactive: a re-forecast of already-elapsed (in-sample) days using the current, latest model. Don't use them to predict future performance; that's what the plan's regular forecast (`altcast_type: null`) is for.

8. **Expecting `results` on a forecasts-list item** — `PlanForecastSummary` (from the list endpoints) is a summary only; it has no `form` or `results`. You must call the show endpoint (`GET /plans/{plan_id}/forecasts/{forecast_id}`) for each forecast you need outcome data from.

9. **Trying to create or edit a plan via the API** — There is no POST/PATCH endpoint yet. All plan authoring happens in the UI for now.

10. **Not handling `null` on `status`, `label`, `total_spend`** — Several fields are nullable (a version can have no dates and thus no derived status). Guard for `None`/`null` before using these values. `primary_version`, by contrast, is never `null` — every plan has one.

11. **Using `altcast` or `kpi` as query param names** — They're silently ignored (200 with the unfiltered set, no error). The correct names are `altcast_types` and `kpi_id`. See Known API Quirks.

12. **Assuming a counterfactual forecast's numbers match the UI's Counterfactual section** — They won't. Even accounting for the different `start_date`/`end_date` scoping altcasts use, engineering has flagged that the result values can reflect a broader combined computation than the UI's Counterfactual section shows, which gets its numbers from a separate, unexposed `compute_plan_counterfactual` request.

13. **Assuming `expected_roi` means "Expected Blended ROI," or confusing it with `expected_observed_paid_roi`** — It used to mean blended ROI (and `paid_roi` used to exist). Today, `expected_roi` and `expected_observed_paid_roi` are both **paid** ROI (not blended with baseline/organic) — they differ only in time window: `expected_observed_paid_roi` is windowed, `expected_roi` counts outcome the spend causes whether it lands during or after the window. `expected_blended_roi` is a separate, windowed-and-blended figure. `paid_roi` is gone, and `total_forecasted_spend` was added. If you see older code or examples using `paid_roi`, they're stale.

14. **Assuming `start_date`/`end_date` bound the forecast's entire daily output** — They don't, and the gap works in opposite directions depending on the forecast kind. A regular forecast's daily output can extend *earlier* than `start_date` (those dates are actuals, not forecast). A "planned" counterfactual's daily output extends *later* than `end_date` (that continuation is a regular forward forecast of the planned budget). Only the actuals counterfactual has its daily output fully bounded by `start_date`/`end_date`.

15. **Assuming a "planned" counterfactual's future segment matches the plan's regular forecast for the same dates** — It might not. The counterfactual's forward segment carries over prior spend from its own retroactive replay of the planned budget; the regular forecast carries over from real actual spend. Different upstream history can produce different downstream numbers.

---

## Known API Quirks (current dev environment)

- A **malformed** (non-UUID) `plan_id` or version `id` currently returns **503** instead of the schema-documented **404**. A well-formed but non-existent UUID correctly returns 404. If you see a 503 on a lookup, check whether the ID you passed is a valid UUID before assuming the resource is down. This one is a genuine implementation bug, not documented behavior.

- **Unrecognized query params on `GET /plans/{plan_id}/forecasts` are silently ignored, not rejected.** This isn't a bug, but it's a real trap: a wrong param name looks exactly like a working-but-empty filter, since the request still returns 200 with the unfiltered set. Two names that are easy to get wrong: the counterfactual filter is `altcast_types` (plural), not `altcast`; the KPI filter is `kpi_id`, not `kpi`. If a filter you're using seems to have no effect, double-check the exact param name before assuming the API is broken (an earlier version of this doc mistakenly reported `altcast` filtering as a server-side no-op — it was actually just the wrong param name).

- `altcast_types` **is a swap, not an additive filter, and it validates its value.** Omit the param entirely to get only the plan's regular, forward-looking forecasts (counterfactuals are excluded by default). Pass it to get *only* counterfactuals of the requested kind(s) instead — there's no single call that returns regular and counterfactual forecasts mixed together. Passing a blank value or an unrecognized string returns **422**, not a silent no-op.

---

## Code Generation Rules

**General:**
- Load the PAT from an environment variable: Python uses `os.environ["RECAST_PAT"]`, R uses `Sys.getenv("RECAST_PAT")`. Teach the user how to set their own environment variable.
- NEVER print, log, or display the token.
- Base URL: `https://api.getrecast.com`
- Auth: Bearer token in the Authorization header.
- This is a read-only API — never generate code that attempts POST/PATCH/DELETE against `/plans`.
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
| GET | `/v1/clients/{client_slug}/plans` | List plans (paginated: `?page=1&per_page=25`; filters: `plan_type`, `label`, `status`, `kpi_ids`, `created_by`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/versions` | List a plan's versions (paginated, same as the Index) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/versions/{id}` | Show full version detail |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/versions/{id}/budget` | Download the daily budget as CSV (`Accept: text/csv`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/forecasts` | List forecasts across every version of the plan (filters: `kpi_id`, `plan_version_id`, `altcast_types`; counterfactuals have `altcast_type` of `"planned"` or `"actuals"`, regular forecasts have `altcast_type: null`) |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/forecasts/{forecast_id}` | Show a single plan-linked forecast |
| GET | `/v1/clients/{client_slug}/plans/{plan_id}/forecasts/{forecast_id}/downloads/{key}` | Download a CSV for one of the forecast's results |

Not yet released: goals.

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

`text/csv` body: `date` column plus one column per channel in the version's `budget_summary` metadata.

---

## Glossary

| Client says | API field / action |
|---|---|
| "plan", "media plan" | A Plan resource, `GET /plans` |
| "live version", "current version" | `primary_version` (Index) / `primary: true` (versions list/show) |
| "version history", "past versions" | `GET /plans/{plan_id}/versions` |
| "budget", "daily spend plan" | `GET /plans/{plan_id}/versions/{id}/budget` (CSV) — NOT the `budget_summary` field on version show, which is metadata only |
| "channels in this plan" | `budget.spend_channels` / `non_spend_channels` / `contextual_variables` / `lower_funnel_channels` on version show |
| "branded search cap", "lower funnel setting" | `lower_funnel_channel_caps` |
| "promotions", "holidays baked into the plan" | `depvar_spike_groups` |
| "can this plan forecast X KPI?" | `compatible_kpis` / `incompatible_kpis` on version show |
| "plan type", "default vs custom" | `plan_type` |
| "is this plan active?" | `status` (`current`/`future`/`expired`) |
| "plan forecast", "counterfactual", "altcast" | `GET /plans/{plan_id}/forecasts` (filter with `plan_version_id` for one version) — counterfactuals are the entries with a non-null `altcast_type` |
| "goal", "pacing", "success probability" | Not part of this API — Goals excluded from this release |

## Resources

If the client asks for something not covered here:
- https://docs.getrecast.com/docs/plans
- https://docs.getrecast.com/docs/forecast-the-performance-of-a-plan
- https://docs.getrecast.com/docs/recommendations
