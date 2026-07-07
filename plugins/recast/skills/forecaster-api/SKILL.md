---
name: forecaster-api
description: Use when predicting outcomes or generating spend plans with the Recast Forecast / Spend Forecast APIs — "what will revenue be if I spend X", "forecast my KPI", "predict outcomes for this budget", "generate a spend plan". Translates forecasting goals into API requests for outcome prediction and budget generation. Forecaster predicts the outcome of a known budget; to choose the best budget, use optimizer-api instead.
---

# Recast Forecaster API — Translating Goals to API Requests

You are helping a Recast client use the Forecast and Spend Forecast APIs programmatically. There are two distinct tools:

1. **Forecast** — "Given this budget, what outcome will I get?" Predicts KPI outcomes (revenue, acquisitions) from a daily budget.
2. **Spend Forecast** — "Build me a daily budget." Generates a model-based daily spend plan from high-level constraints (total spend, channel targets, date range).

These are complementary: use Spend Forecast to build a budget, then Forecast to predict what that budget will produce.

**CRITICAL — Forecast date constraint:** Forecast budgets cannot start from an arbitrary future date. They must start on the day after the model's last historical date (`end_date + 1` from the deployment). Use the Deployments endpoint to determine valid date ranges before constructing a forecast form.

## Deployments API — Model Metadata

Before building any forecast form, use the Deployments endpoint to discover model date ranges and channel names. This is essential for constructing valid requests.

### Endpoints

```
GET /v1/clients/{client_slug}/deployments                → list in response["data"] (paginated)
GET /v1/clients/{client_slug}/deployments/{id}           → detail returned directly (no wrapper)
```

The list endpoint supports a `?dashboard_slug=` filter to narrow results.

### Deployment Summary (from list)

Each item in the list includes: `id`, `dashboard_slug`, `active`, `model_date`, `created_at`, `updated_at`.

### Deployment Detail (from show)

The detail endpoint returns everything you need to construct valid forecast forms:

| Field | Description |
|---|---|
| `start_date` | First date in the model's historical data |
| `end_date` | **Last date in the model's historical data. Forecast budgets must start on `end_date + 1`.** |
| `n_forecast` | Maximum number of forecast days forward from `end_date` |
| `spend_channels_labels` | **Array of all spend channel names** — use these as column headers in budgets and as valid channel names in constraints |
| `upper_funnel_channel_labels` | Channels the user directly controls (subset of spend channels) |
| `lower_funnel_channel_labels` | Channels predicted by the model (e.g., branded search) |
| `non_spend_channels_labels` | Non-spend inputs the model uses |
| `spend` | Historical spend data as a 2D array |
| `default_budget` | Default budget template as a 2D array |
| `contextual_variable_defaults` | Object mapping context variable names to their default values |
| `spikes` | Array of spike objects with `name` and `dates` — only these spike names are valid |
| `currency_symbol`, `currency_name` | Currency info (optional) |

### Determining valid forecast dates

```python
# Get deployment detail for the deployment used in depvar_configurations
dep = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments/{deployment_id}", headers=HEADERS).json()

model_end = dep["end_date"]           # e.g., "2026-03-14"
n_forecast = dep["n_forecast"]        # e.g., 180

# Forecast budget must start on model_end + 1
from datetime import datetime, timedelta
forecast_start = (datetime.strptime(model_end, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
max_forecast_end = (datetime.strptime(model_end, "%Y-%m-%d") + timedelta(days=n_forecast)).strftime("%Y-%m-%d")

# Valid range for forecast budgets: forecast_start through max_forecast_end
```

**When multi-KPI / multi-deployment:** If the form includes multiple `depvar_configurations` with different `deployment_id`s, the forecast budget must start after the **earliest** `end_date` across all deployments (i.e., `min(end_dates) + 1`). The budget must cover from that earliest start date forward so all models have the input data they need.

**Note:** This date constraint applies to **Forecasts** only. Spend Forecasts do not have this restriction.

### Getting channel names

Use `spend_channels_labels` from the deployment detail to get the exact channel names the model expects:

```python
dep = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments/{deployment_id}", headers=HEADERS).json()
channels = dep["spend_channels_labels"]  # ["meta_prospecting", "meta_retargeting", "linear_tv", ...]
```

These are the valid values for:
- Column headers in the forecast `budget` 2D array
- `channels` arrays in spend forecast constraints

## Conversation Flow

### 1. Gather context

Ask the client these questions naturally (one or two at a time):

- **What they need**: What they're trying to get out of the results (typically a revenue/conversions forecast for a specific period of time)
- **Budget source** (for Forecast): Do they have a CSV/spreadsheet with daily spend by channel? Or do they need to build one first?
- **Constraints** (for Spend Forecast): Total spend? Per-channel targets? Date range?
- **Scale**: Single run or looping over multiple variations?
- **Output**: What results do they care about?
  - For Forecast: expected_outcome, expected_roi, paid_roi, CSV downloads (channel_summary, daily predictions)
  - For Spend Forecast: the generated daily budget (returned as a 2D array in `results.budget`). You may need to trim results to a particular date range they care about.

Don't ask about coding language. If they specify one, use it. Otherwise use Python.

### 2. Confirm understanding

Before generating code, summarize:
- Which API(s) will be used (Forecast, Spend Forecast, or both)
- The starting template or inputs
- What fields will be modified
- How many variations (if looping)
- What output will be captured

### 3. Generate code

Write a single, self-contained script following the rules in the Code Generation section below.

---

## The Two Tools: When to Use Which

| Client says | Use | Why |
|---|---|---|
| "What will happen if I spend this budget?" | **Forecast** | They have a budget, want outcome predictions |
| "I have a CSV of daily spend, predict revenue" | **Forecast** | Budget exists, need KPI prediction |
| "Generate a budget, then tell me what it produces" | **Both** | Spend Forecast first, then Forecast with the result |
| "What ROI will I get from $1.5M in Q2?" | **Both** | Build budget with Spend Forecast, predict with Forecast |
| "Same as last quarter but +20% on Meta" | **Both** with constraints | Modify existing patterns |

---

## Forecast API

The Forecast predicts KPI outcomes given a complete daily budget.

### Forecast Form Schema

```json
{
  "budget": [
    ["date", "channel_1", "channel_2", ...],
    ["2026-04-01", 1000.0, 2000.0, ...],
    ["2026-04-02", 1100.0, 1900.0, ...]
  ],
  "depvar_configurations": [
    {
      "deployment_id": 456,
      "multiplier": 1.0,
      "name": "revenue",
      "spikes": [
        { "name": "Prime Day", "dates": ["2026-07-15"] }
      ]
    }
  ],
  "start_date": "YYYY-MM-DD (optional — trim forecast window start)",
  "end_date": "YYYY-MM-DD (optional — trim forecast window end)",
  "limit_spend": "boolean (optional)",
  "lower_funnel_caps": { "channel_name": cap_value },
  "run_recommendations": false
}
```

### Budget format (the `budget` field)

The budget is a **2D array** (array of arrays):
- **Row 0** (header): `["date", "channel_1", "channel_2", ...]` — column names
- **Rows 1+** (data): `["2026-04-01", "1000.0", "2000.0", ...]` — one row per day

**Critical rules:**
- The first column is always `"date"` in YYYY-MM-DD format.
- **The budget must start on `deployment.end_date + 1`** — the day after the model's last historical date. Use the Deployments endpoint to determine this. You cannot forecast from an arbitrary future date.
- Channel columns must match the model's channel names exactly. Use `spend_channels_labels` from the Deployments endpoint to get valid names.
- Values can be numbers or numeric strings.
- The budget must cover the full forecast window. If you want to forecast April-June, the budget must have rows for every day in that range.
- Context variables (e.g., `price`, `brand_awareness`) can be included as additional columns. If omitted, the model uses default values. Use `contextual_variable_defaults` from the Deployments endpoint to see available context variables.
- Lower funnel channels (e.g., `search_branded`) should be included in the budget — the model uses them as inputs.

### Converting a CSV to the budget 2D array

**Python:**
```python
import csv

with open("budget.csv") as f:
    reader = csv.reader(f)
    budget = list(reader)
# budget is now [["date", "ch1", ...], ["2026-04-01", "1000", ...], ...]
```

**R:**
```r
csv <- read.csv("budget.csv", check.names = FALSE)
budget <- rbind(colnames(csv), apply(csv, 1, as.character))
# Convert to list-of-lists for JSON serialization
```

### Getting depvar_configurations and channel names

You need valid `deployment_id` values. Get them from the KPIs endpoint:

```
GET /v1/clients/{client_slug}/kpis              → list is in response["data"]
GET /v1/clients/{client_slug}/kpis/{kpi_id}     → detail returned directly (no wrapper)
```

The KPI detail response includes `depvar_configurations` ready to drop into the form.

Once you have a `deployment_id`, use the Deployments endpoint to get model date ranges and channel names:

```
GET /v1/clients/{client_slug}/deployments/{deployment_id}  → returned directly (no wrapper)
```

The deployment detail provides `end_date` (to compute forecast start), `n_forecast` (max days), and `spend_channels_labels` (valid channel names for budget columns and constraints).

### Optional form fields

| Field | Purpose |
|---|---|
| `start_date` / `end_date` | Trim the forecast to a sub-window of the budget. If omitted, forecasts the full budget range. |
| `limit_spend` | Boolean. Controls whether lower funnel spend is capped. |
| `lower_funnel_caps` | Object mapping lower funnel channel names to cap values. Caps total spend over the period (not per-day). |
| `run_recommendations` | If `true`, auto-recommendations will be run alongside the forecast. Results appear in the `recommendation` field of the show response. |
| `spikes` | Promotional events within `depvar_configurations`. Names must match model spike groups. |

### Forecast results

When the forecast completes (`status: "success"`), the show response includes `results`:

```json
{
  "results": [
    {
      "depvars": [{ "name": "revenue", "deployment_id": 456, "weight": 1.0 }],
      "expected_outcome": 5234567.89,
      "expected_roi": 3.45,
      "paid_roi": 2.89,
      "downloads": [
        { "description": "Channel Summary", "key": "channel_summary" },
        { "description": "Daily Forecast", "key": "daily_forecast" }
      ]
    }
  ]
}
```

Download CSVs with:
```
GET /v1/clients/{client_slug}/forecasts/{id}/downloads/{key}
```
Set `Accept: text/csv` header.

### Recommendations

If `run_recommendations: true` was set, the show response also includes a `recommendation` field:

```json
{
  "recommendation": {
    "status": "success",
    "forecasted_mean": 5234567.89,
    "forecasted_roi": 3.45,
    "forecasted_total_spend": 1500000.0,
    "forecast_delta_mean": 123456.78,
    "forecast_delta_low": 50000.0,
    "forecast_delta_high": 200000.0,
    "downloads": [{ "description": "...", "key": "..." }]
  }
}
```

The recommendation compares an optimized reallocation against the submitted budget.

---

## Spend Forecast API

The Spend Forecast generates a model-based daily budget. It uses the model's learned patterns (seasonality, day-of-week, channel pulsing) to distribute spend across days and channels.

### Spend Forecast Form Schema

```json
{
  "start_date": "YYYY-MM-DD (required)",
  "end_date": "YYYY-MM-DD (required)",
  "depvar_configurations": [
    { "deployment_id": 456 }
  ],
  "total_spend": 1000000,
  "constraints": [
    {
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "channels": ["meta_prospecting", "meta_retargeting"],
      "spend": 50000
    }
  ]
}
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `start_date` | string (YYYY-MM-DD) | Budget period start |
| `end_date` | string (YYYY-MM-DD) | Budget period end |
| `depvar_configurations` | array | At minimum `[{"deployment_id": N}]`. Get valid IDs from the KPIs endpoint. |

### Spend specification (choose ONE or neither)

There are three modes — use **at most one** of `total_spend` or `constraints`. Providing both returns a 422 error.

**1. No spend spec (BAU baseline):**
Omit both `total_spend` and `constraints`. The model extrapolates business-as-usual spending from historical patterns.

```json
{
  "start_date": "2026-04-01",
  "end_date": "2026-06-30",
  "depvar_configurations": [{ "deployment_id": 456 }]
}
```

**2. Total spend:**
Set a total budget for the period. The model distributes it across channels and days using historical ratios.

```json
{
  "start_date": "2026-04-01",
  "end_date": "2026-06-30",
  "total_spend": 1500000,
  "depvar_configurations": [{ "deployment_id": 456 }]
}
```

`total_spend` must be > 0 (a number, not a string).

**3. Channel constraints:**
Specify spend for specific channels or channel groups during specific date ranges. Unconstrained channels get BAU spend.

```json
{
  "start_date": "2026-04-01",
  "end_date": "2026-06-30",
  "constraints": [
    {
      "start_date": "2026-04-01",
      "end_date": "2026-04-30",
      "channels": ["meta_prospecting", "meta_retargeting"],
      "spend": 50000
    },
    {
      "start_date": "2026-04-01",
      "end_date": "2026-04-30",
      "channels": ["linear_tv"],
      "spend": 100000
    }
  ],
  "depvar_configurations": [{ "deployment_id": 456 }]
}
```

### Constraint rules

- Each constraint requires: `start_date`, `end_date`, `channels` (array of strings), `spend` (number).
- `channels` is a list of channel names. When multiple channels are in one constraint, the model splits the total `spend` across them using learned historical ratios — do NOT manually split.
- Constraint dates must fall within the overall `start_date`/`end_date` range. Dates outside the range return 422.
- Channel names must match actual model channels. Invalid names return 422.
- `total_spend` and `constraints` are **mutually exclusive**. Providing both returns 422.
- Multiple constraints for different channel groups within the same date range are OK.
- Multiple constraints for the same channels in different date ranges are OK.

### Spend Forecast results

When the spend forecast completes, the show response includes `results.budget`:

```json
{
  "results": {
    "budget": [
      ["date", "channel_1", "channel_2", ...],
      ["2026-04-01", "1234.56", "2345.67", ...],
      ["2026-04-02", "1200.00", "2400.00", ...]
    ]
  }
}
```

The budget is a 2D array: first row is headers (`date` + channel names), subsequent rows are daily spend values as strings.

**This budget can be passed directly as the `budget` field in a Forecast form** to predict outcomes from the generated spend plan.

---

## Recommended Workflows

### Workflow 1: Forecast from an existing budget CSV

```
1. GET /kpis → find KPI → GET /kpis/{id} → get depvar_configurations
2. GET /deployments/{deployment_id} → get end_date, n_forecast, spend_channels_labels
3. Validate CSV dates start at end_date + 1 and channel names match spend_channels_labels
4. Read CSV → convert to 2D array
5. POST /forecasts with { form: { budget, depvar_configurations } }
6. Poll GET /forecasts/{id} until status != "processing"
7. Download CSVs from results
```

### Workflow 2: Generate a budget with Spend Forecast

```
1. GET /kpis → find KPI → GET /kpis/{id} → get depvar_configurations
2. GET /deployments/{deployment_id} → get spend_channels_labels (for valid constraint channel names)
3. POST /spend_forecasts with { form: { start_date, end_date, depvar_configurations, total_spend or constraints } }
4. Poll GET /spend_forecasts/{id} until status != "processing"
5. Extract results.budget — this is your daily budget
```

### Workflow 3: Generate budget then predict outcomes (combined)

```
1. GET /kpis → get depvar_configurations
2. GET /deployments/{deployment_id} → get end_date for forecast start date
3. POST /spend_forecasts → generate budget
4. Poll until complete → extract results.budget
5. POST /forecasts with { form: { budget: results.budget, depvar_configurations } }
6. Poll until complete → get outcome predictions + downloads
```

### Workflow 4: Template-based (modify existing)

```
1. GET /forecasts (or /spend_forecasts) → find successful one from response["data"]
2. GET /forecasts/{id} (or /spend_forecasts/{id}) → extract form (returned directly, no data wrapper)
3. Modify the form
4. POST to create new one
5. Poll + download
```

---

## Translating Client Asks to Form Fields

### For Forecast

| Client says | What to do |
|---|---|
| "What revenue will this budget produce?" | POST /forecasts with their budget |
| "I have a CSV with daily spend" | Read CSV, convert to 2D array, POST /forecasts |
| "What's my ROI for this plan?" | POST /forecasts, check `expected_roi` in results |
| "Compare two budget scenarios" | POST two forecasts with different budgets, compare results |
| "What if I add a sale event?" | Add spikes to depvar_configurations |
| "What's the incremental impact?" | Look at the channel summary download and summarize Impact |
| "Cap branded search at $100K" | Set `lower_funnel_caps: {"search_branded": 100000}` |
| "Only forecast April-May from a full-year budget" | Set `start_date` and `end_date` to trim |

### For Spend Forecast

| Client says | What to do |
|---|---|
| "Build me a budget for Q3" | POST /spend_forecasts with date range, no spend spec (BAU) |
| "I want to spend $2M next quarter" | `total_spend: 2000000` |
| "Meta should be $300K in April" | Constraint: `{start_date: "2026-04-01", end_date: "2026-04-30", channels: ["meta_prospecting", "meta_retargeting"], spend: 300000}` |
| "$50K/month on TV for 3 months" | Three constraints, one per month, each with `spend: 50000` |
| "Same as last quarter" | BAU baseline (no total_spend, no constraints) |
| "20% more on search than usual" | Currently no percentage-based constraint — use historical data to calculate the absolute number |
| "Zero spend on podcasts" | Constraint with `spend: 0` for that channel |

---

## Common Scenarios with Full Examples

### Scenario 1: Forecast from CSV

```python
import os, csv, time, io, requests, pandas as pd

BASE_URL = "https://api.getrecast.com"
CLIENT_SLUG = "democlient"
PAT = os.environ["RECAST_PAT"]
HEADERS = {"Authorization": f"Bearer {PAT}", "Accept": "application/json"}

# Read budget CSV
with open("budget.csv") as f:
    budget = list(csv.reader(f))

# Get depvar_configurations from KPI
kpis = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/kpis", headers=HEADERS).json()["data"]
kpi = next(k for k in kpis if k["name"] == "Amazon Revenue")
kpi_detail = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/kpis/{kpi['id']}", headers=HEADERS).json()
depvar_configs = kpi_detail["depvar_configurations"]

# Submit forecast
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/forecasts",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "form": {"budget": budget, "depvar_configurations": depvar_configs},
        "name": "Q2 Forecast from CSV",
        "show_in_ui": False,
        "use_latest_deployments": True,
    },
)
assert resp.status_code == 201, f"Create failed: {resp.text}"
forecast_id = resp.json()["id"]

# Poll
while True:
    result = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/forecasts/{forecast_id}", headers=HEADERS).json()
    print(f"Status: {result['status']}")
    if result["status"] not in ("ready", "processing"):
        break
    time.sleep(30)

# Download channel summary
if result["status"] == "success" and result.get("results"):
    for dl in result["results"][0]["downloads"]:
        csv_resp = requests.get(
            f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/forecasts/{forecast_id}/downloads/{dl['key']}",
            headers={**HEADERS, "Accept": "text/csv"},
        )
        df = pd.read_csv(io.StringIO(csv_resp.text))
        df.to_csv(f"{dl['key']}.csv", index=False)
        print(f"Saved {dl['key']}.csv ({len(df)} rows)")
```

### Scenario 2: Generate budget with Spend Forecast

```python
# Get depvar_configurations (same as above)
# ...

# Create spend forecast with total spend
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/spend_forecasts",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "form": {
            "start_date": "2026-04-01",
            "end_date": "2026-06-30",
            "total_spend": 1500000,
            "depvar_configurations": [{"deployment_id": dc["deployment_id"]} for dc in depvar_configs],
        },
        "name": "Q2 Budget $1.5M",
        "use_latest_deployments": True,
    },
)
assert resp.status_code == 201, f"Create failed: {resp.text}"
sf_id = resp.json()["id"]

# Poll
while True:
    result = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/spend_forecasts/{sf_id}", headers=HEADERS).json()
    print(f"Status: {result['status']}")
    if result["status"] not in ("ready", "processing"):
        break
    time.sleep(30)

# Extract the generated budget
if result["status"] == "success":
    generated_budget = result["results"]["budget"]
    print(f"Generated {len(generated_budget) - 1} days of budget across {len(generated_budget[0]) - 1} channels")
```

### Scenario 3: Spend Forecast with channel constraints

```python
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/spend_forecasts",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "form": {
            "start_date": "2026-04-01",
            "end_date": "2026-06-30",
            "constraints": [
                {
                    "start_date": "2026-04-01",
                    "end_date": "2026-06-30",
                    "channels": ["meta_prospecting", "meta_retargeting"],
                    "spend": 300000,
                },
                {
                    "start_date": "2026-04-01",
                    "end_date": "2026-06-30",
                    "channels": ["linear_tv"],
                    "spend": 150000,
                },
            ],
            "depvar_configurations": [{"deployment_id": dc["deployment_id"]} for dc in depvar_configs],
        },
        "name": "Q2 Budget with channel constraints",
        "use_latest_deployments": True,
    },
)
```

### Scenario 4: Combined — generate budget then forecast

```python
# Step 1: Generate budget via Spend Forecast
# (same as Scenario 2, poll until complete, extract generated_budget)

# Step 2: Use that budget to forecast outcomes
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/forecasts",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "form": {
            "budget": generated_budget,
            "depvar_configurations": depvar_configs,
        },
        "name": "Forecast from generated Q2 budget",
        "show_in_ui": False,
        "use_latest_deployments": True,
    },
)
# Poll and download as in Scenario 1
```

### Scenario 5: Sweep total spend with Spend Forecast

```python
import copy

spend_levels = [500000, 1000000, 1500000, 2000000]
base_form = {
    "start_date": "2026-04-01",
    "end_date": "2026-06-30",
    "depvar_configurations": [{"deployment_id": dc["deployment_id"]} for dc in depvar_configs],
}

for spend in spend_levels:
    form = copy.deepcopy(base_form)
    form["total_spend"] = spend
    resp = requests.post(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/spend_forecasts",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={"form": form, "name": f"Budget ${spend:,}", "use_latest_deployments": True},
    )
    print(f"${spend:,}: created ID {resp.json()['id']}")
```

---

## Response Envelope — List vs Show Endpoints

**List endpoints** (GET `/forecasts`, GET `/spend_forecasts`, GET `/kpis`) wrap their payload in a `data` key with `pagination` (for forecasts/spend_forecasts). You must access `response["data"]` to get the array of items.

**Show endpoints** (GET `/forecasts/{id}`, GET `/spend_forecasts/{id}`, GET `/kpis/{id}`) return the object **directly** — no `data` wrapper.

**Create endpoints** (POST) return `{"id": N}` directly.

---

## Common Mistakes to Avoid

1. **Confusing Forecast with Spend Forecast** — Forecast predicts outcomes from a budget. Spend Forecast generates a budget. They are different endpoints with different forms.

2. **Providing both `total_spend` and `constraints` in a Spend Forecast** — These are mutually exclusive. Pick one or neither. Providing both returns a 422.

3. **Constraint dates outside the form's date range** — Constraint `start_date`/`end_date` must fall within the form-level `start_date`/`end_date`. Otherwise 422.

4. **Invalid channel names in constraints** — Channel names must match the model exactly. Invalid names return 422. Use `spend_channels_labels` from the Deployments endpoint to get valid names.

5. **Manually splitting grouped channel spend** — When multiple channels are in one constraint, the model splits the total spend using historical ratios. Don't invent 80/20 splits.

6. **Forgetting the `data` wrapper on list endpoints** — `GET /forecasts` and `GET /spend_forecasts` return `{"data": [...], "pagination": {...}}`. Show endpoints return the object directly.

7. **Not polling until complete** — Forecasts and spend forecasts run asynchronously. You must poll the show endpoint until `status` is no longer `"ready"` or `"processing"`. Typical runtime: 1-5 minutes.

8. **Missing depvar_configurations** — Both Forecast and Spend Forecast forms require `depvar_configurations`. Get valid ones from the KPIs endpoint.

9. **Budget missing the date column** — The budget 2D array's first column must be `"date"`. Rows without dates will fail.

10. **Not including lower funnel channels in the forecast budget** — Lower funnel channels (e.g., `search_branded`) should be included as columns in the budget. The model uses them as inputs.

11. **Using `total_spend` as a string** — Unlike the optimizer form where many values are strings, `total_spend` in the Spend Forecast form is a **number** (not a string).

12. **Expecting outcome predictions from Spend Forecast** — Spend Forecast only returns a budget (daily spend by channel). To get revenue/ROI predictions, pass the generated budget to the Forecast endpoint.

13. **Starting a forecast from an arbitrary future date** — Forecast budgets must start on `deployment.end_date + 1` (the day after the model's last historical date). You cannot pick a random start date like "next Monday." Always check the Deployments endpoint first to determine the valid start date. (Spend Forecasts do not have this restriction.)

14. **Not checking the Deployments endpoint first** — The Deployments endpoint provides the model's date range, valid channel names, context variable defaults, and spike names. Skipping this step leads to invalid dates, wrong channel names, and missing context variables.

---

## Code Generation Rules

**General:**
- Load the PAT from an environment variable: Python uses `os.environ["RECAST_PAT"]`, R uses `Sys.getenv("RECAST_PAT")`. Teach the user how to set their own environment variable.
- NEVER print, log, or display the token.
- Base URL: `https://api.getrecast.com`
- Auth: Bearer token in the Authorization header.
- Always set `show_in_ui = False` for the create forecast endpoint unless the client specifically asks to see results in the UI.
- Always set `use_latest_deployments = True` unless they specifically mention wanting to use older deployments.
- Include error handling that shows the response body on non-200/201 responses.
- Poll for completion with a 30-second interval and 15-minute timeout.
- Check for both `"ready"` and `"processing"` statuses when polling — both mean "not done yet."

**Python specific:**
- Use `requests` and `pandas`
- Use f-strings for URL construction
- Parse CSV with `pd.read_csv(io.StringIO(resp.text))`
- Use `copy.deepcopy()` when modifying form templates in loops
- Use the `csv` module for reading budget CSVs into 2D arrays

**R specific:**
- Use `httr2` and `jsonlite`
- Use pipe `|>` syntax
- Parse responses with `resp_body_string() |> fromJSON(simplifyVector = FALSE)`
- Use `req_error(is_error = \(resp) FALSE)` to handle errors manually

---

## API Reference

### Forecast Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/clients/{client_slug}/forecasts` | List forecasts (paginated, items in `data`) |
| GET | `/v1/clients/{client_slug}/forecasts/{id}` | Show forecast (returned directly, no wrapper) |
| POST | `/v1/clients/{client_slug}/forecasts` | Create forecast |
| GET | `/v1/clients/{client_slug}/forecasts/{id}/downloads/{key}` | Download CSV (`Accept: text/csv`) |

### Spend Forecast Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/clients/{client_slug}/spend_forecasts` | List spend forecasts (paginated, items in `data`) |
| GET | `/v1/clients/{client_slug}/spend_forecasts/{id}` | Show spend forecast (returned directly, no wrapper) |
| POST | `/v1/clients/{client_slug}/spend_forecasts` | Create spend forecast |

### Deployment Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/clients/{client_slug}/deployments` | List deployments (paginated, items in `data`). Supports `?dashboard_slug=` filter. |
| GET | `/v1/clients/{client_slug}/deployments/{id}` | Show deployment detail: date ranges, channel names, defaults (returned directly) |

### KPI Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/clients/{client_slug}/kpis` | List KPIs (items in `data`) |
| GET | `/v1/clients/{client_slug}/kpis/{id}` | Show KPI detail with depvar_configurations (returned directly) |

### Forecast Create request body

```json
{
  "form": {
    "budget": [["date", ...], ["2026-04-01", ...], ...],
    "depvar_configurations": [{ "deployment_id": 456, "multiplier": 1.0, "name": "revenue", "spikes": [] }]
  },
  "name": "string",
  "show_in_ui": false,
  "use_latest_deployments": true
}
```

### Spend Forecast Create request body

```json
{
  "form": {
    "start_date": "2026-04-01",
    "end_date": "2026-06-30",
    "depvar_configurations": [{ "deployment_id": 456 }],
    "total_spend": 1500000
  },
  "name": "string",
  "use_latest_deployments": true
}
```

Note: Spend Forecast does not have a `show_in_ui` field.

---

## Glossary

| Client says | API field / action |
|---|---|
| "budget", "spend plan", "media plan" | Forecast `form.budget` (2D array) |
| "what will happen", "predict", "forecast" | POST `/forecasts` |
| "build a budget", "generate spend" | POST `/spend_forecasts` |
| "total spend", "total budget" | Spend Forecast `form.total_spend` |
| "channel spend", "per-channel" | Spend Forecast `form.constraints` |
| "model", "KPI" | `depvar_configurations` (get from `/kpis`) |
| "weight", "importance" | `depvar_configurations[].multiplier` |
| "promotional event", "sale" | `depvar_configurations[].spikes` |
| "lower funnel", "branded search" | Forecast `form.lower_funnel_caps` |
| "recommendations", "could I do better?" | Forecast `form.run_recommendations: true` |
| "download", "CSV", "export" | GET `/forecasts/{id}/downloads/{key}` |

## Resources

If the client asks for something not covered here:
- https://docs.getrecast.com/docs/forecaster
- https://docs.getrecast.com/docs/the-forecaster-api
- https://docs.getrecast.com/docs/spend-forecasting-api
