---
name: reporter-api
description: Use when pulling data or reports from the Recast Reporter API — "get channel ROI as CSV", "download attribution data", "export model results", "create a report via the API". Identifies the right report_type from what the user wants to analyze, prompts for required inputs, generates code to create/poll/download CSV results.
---

# Recast Reporter API — Matching Goals to Reports

You are helping a Recast client use the Reporter API programmatically. Your job is to:

1. Understand what data or insight they're trying to get
2. Identify the correct `report_type`
3. Gather the required form inputs for that report
4. Generate code to create the report, poll until complete, and download the CSVs

**Critical quirk**: `report_type` lives **inside** the `form` object, NOT at the top level of the request body. The Swagger spec says top-level — ignore that. Always put `report_type` inside `form`.

---

## Conversation Flow

### 1. Identify the report type

Ask the client what they're trying to analyze. They'll give either a description of the data they want or the name of a report. Use the Report Type Reference table below to match to the correct `report_type`. If the match is ambiguous between two similar report types, describe what each returns and ask which fits.

Don't ask about coding language. If they specify one, use it. Otherwise use Python.

### 2. Gather required inputs

Once you know the report type, ask for the required form fields (see Form Fields by Report Type). Explain each input in plain English — don't just list field names.

You'll always need:
- `deployment_id` — the numeric ID of the model deployment. If they don't know it, offer to look it up via the KPIs or Deployments endpoints.
- `report_type` — determined by step 1 (placed inside the form)

### 3. Confirm and generate code

Before writing code, confirm:
- Which report type and what it will show
- The form inputs you'll use
- Which CSV downloads will be available when it completes (use the Download Keys Reference)

Then write a self-contained script following the Code Generation Rules.

---

## Report Type Reference

Use this to match the user's description to the correct `report_type`.

### Intent → report_type mapping

| User says / wants | `report_type` | Required inputs besides `deployment_id` | Pre-rendered? |
|---|---|---|---|
| "Channel contribution", "how much did each channel drive?", "attribution breakdown", "which channels are working?" | `compute_insights_overview` | `start_date`, `end_date` | Yes |
| "Baseline", "organic sales", "intercept", "non-marketing contribution", "what would sales be without marketing?" | `compute_baseline_summary` | `start_date`, `end_date`, `include_spikes` | Yes |
| "Time delay between spend and outcome", "adstock", "carryover", "shift curves", "how long before spend converts?" | `compare_shift_curves` | `channels` | Yes |
| "Spend response curves", "saturation curves", "what happens at different spend levels?", "diminishing returns" | `compute_spend_response_curves` | `date`, `num_days`, `channels` | Yes |
| "Compare two time periods", "before vs after", "period comparison", "how did performance change?" | `compare_time_periods` | `previous_start_date`, `previous_end_date`, `period_start_date`, `period_end_date` | No |
| "Channel performance with grouping", "grouped ROI", "custom channel groups" | `compute_grouped_channel_summaries` | `start_date`, `end_date`, `channel_groups`, `include_lower_funnel_effects` | Yes |
| "Fixed spend performance", "performance at a specific spend level", "what's the ROI at $X?" | `compute_fixed_spend_performance` | `start_date`, `end_date`, `channels`, `include_lower_funnel_effects`, `spend` | No |
| "How much was spent in each channel?", "spend summary", "reconcile spend vs internal data" | `compute_spend_summary` | `start_date`, `end_date` | Yes |
| "Spike effects", "promotion impact", "holiday lift", "pull-forward and pull-back" | `compute_spike_detail_summary` | *(none)* | Yes |
| "Period summary", "in-period effects", "future returns from past spend", "comprehensive period breakdown" | `compute_period_summary` | `start_date`, `end_date` | No |
| "Lower funnel details", "what drives branded search spend?", "upper-to-lower funnel waterfall" | `compute_lower_funnel_waterfall` | `start_date`, `end_date` | Yes |
| "Upper funnel details", "how much of my ROI comes from lower funnel?", "indirect ROI" | `compute_upper_funnel_details` | `start_date`, `end_date`, `channels` | No |
| "Context variables", "price effects", "brand awareness impact", "external factors on marketing effectiveness" | `compute_context_variable_summary` | `start_date`, `end_date` | Yes |
| "In-sample model fit", "how well does the model fit the data?", "model diagnostics" | `compute_in_sample_model_fit` | `start_date`, `end_date` | No |
| "Marketing vs baseline", "organic share vs marketing share", "how much does marketing move my KPI?" | `compute_marketing_vs_baseline` | `start_date`, `end_date` | No |
| "Channel uncertainty", "why is the confidence interval wide?", "uncertainty drivers", "lack of signal" | `compute_prior_vs_posterior` | `start_date`, `end_date`, `channels` | Yes |
| "Daily spend vs KPI", "channel correlations", "spend patterns", "are my channels correlated?" | `compute_daily_spend_vs_KPI` | `start_date`, `end_date`, `channels` | No |
| "Share of spend vs share of effect", "over/underperforming channels over time", "efficiency trend" | `compute_share_of_spend_vs_effect` | `start_date`, `end_date`, `granularity` | No |
| "ROI waterfall", "what's driving my ROI?", "decompose ROI", "why did my ROI change?" | `compute_roi_cpa_waterfall_plots` | `start_date`, `end_date`, `channels` | No |
| "Backtest", "out-of-sample model performance", "holdout evaluation" | `compute_backtest_summaries` | *(none)* | Yes |
| "Model configuration", "priors", "model settings", "export model parameters" | `compute_model_configuration` | *(none)* | Yes |
| "Experiments", "experiment results", "test results" | `compute_experiments_summaries` | *(none)* | Yes |
| "Clean data", "raw data export", "export input data" | `compute_clean_data` | *(none)* | Yes |
| "Channel Uncertainty" | `compute_channel_uncertainty_drivers` | `start_date`, `end_date` | No |

---

## Report Descriptions

### compute_insights_overview
Shows how much of the KPI each channel drove in the date range — broken down by total vs. direct impact, shifted vs. unshifted, with ROI and MROI. The primary channel attribution report. Start here for any "what's working?" question.

**Downloads**: impact (shifted/unshifted × total/direct), ROI, MROI — 8 CSVs total.

### compute_baseline_summary
Shows the non-marketing (organic/baseline) contribution to KPI over time. Answers: "what would sales look like without any marketing?" Can include or exclude spike/promotional effects. Can be run into the future to see forecasted baseline.

**Downloads**: `summary_total`, `summary_monthly`, `summary_daily`.

### compare_shift_curves
Shows the time-delay (adstock/carryover) between when a channel spends and when that spend's effect is realized. Day 0 is the spend date. Essential for understanding long-tail effects of TV or branded campaigns.

**Downloads**: `all_shift_curves_summarized` (one row per channel × day offset).

### compute_spend_response_curves (Multi-Day Spend Response)
Shows impact, ROI/CPA, and MROI/MCPA at different spend levels for selected channels, evaluated at a specific date over a lookback window of `num_days` days. Points are anchored to actual historical spend in that window. Useful for saturation and scaling analysis.

**Downloads**: `multi_day-multi_channel-tables-full_table`.

### compare_time_periods
Compares ROI/CPA, mROI/mCPA, baseline, in-period effect, and total outcome across two distinct time periods. Also provides channel-level comparison with % change and confidence intervals. The previous period must end strictly before the current period starts.

**Downloads**: `summary-overall` (aggregate), `summary-time_table` (channel-level).

### compute_grouped_channel_summaries
Channel performance report with user-defined groupings (e.g., "Paid Social", "TV & Audio"). Reports impact, ROI, and MROI for each group across daily/weekly/monthly/total granularities.

**Downloads**: one CSV per group × metric × granularity combination — keys follow pattern `group_summaries-{group_name}-{metric}-{granularity}`.

### compute_fixed_spend_performance
Estimates channel performance at a fixed spend level — historically or up to 730 days into the future. Run with a small spend (e.g., $1) to see baseline efficacy before saturation.

**Downloads**: check `results.downloads` after completion — vary by deployment.

### compute_spend_summary
Summarizes how much was spent per channel over a time period. Useful for reconciling Recast data against internal spend systems. Provides daily, weekly, monthly, and total views.

**Downloads**: `tables-daily`, `tables-weekly`, `tables-monthly`, `tables-total`.

### compute_spike_detail_summary
Shows how promotions, holidays, and spikes affected the KPI day-by-day, including pull-forward and pull-back effects. Provides both individual spike views (each event separately) and grouped views (all instances of a recurring event like "Black Friday" combined).

**Downloads**: `individual_daily_effects`, `individual_cumulative_effects`, `individual_cumulative_effects_summarized`, `grouped_daily_effects`, `grouped_cumulative_effects`, `grouped_cumulative_effects_summarized`.

### compute_period_summary
Comprehensive breakdown of a time period: KPI driven during the period, KPI earned after the period from spend in the period, and total future returns. Answers: "how much of the effect from this period's spend has already come in vs. is still coming?"

**Downloads**: `summary_tables-merged_means_summary`, `summary_tables-total_effect`, `summary_tables-in_period_effect`, `summary_tables-after_period_effect`, `summary_tables-future_effect`, `summary_tables-observed_roi`, `summary_tables-true_roi`, `summary_tables-pre_period_effect`.

### compute_lower_funnel_waterfall
Shows which upper funnel channels drove spend into each lower funnel channel, with rates and KPI effects. Answers: "where is my branded search spend actually coming from?"

**Downloads**: `channel_summaries-{lower_funnel_channel}-summary_table` (one per lower funnel channel), `daily_effect-table`.

### compute_upper_funnel_details
Shows how each upper funnel channel contributes to ROI through lower funnel channels — Direct ROI vs. Total ROI over time. The gap is the indirect ROI from lower funnel activity.

**Downloads**: `channel_summaries-{channel}-summary_table` (one per selected channel).

### compute_context_variable_summary
Shows the effect of contextual variables (price, brand awareness, etc.) on marketing effectiveness over time. Only available for deployments that have contextual variables configured. Shows effect size, variable over time, and effect over time.

**Downloads**: check `results.downloads` after completion.

### compute_in_sample_model_fit
Model diagnostic: shows predicted vs. actual KPI in-sample, with fit statistics. Use this to assess how well the model fits the training data (in contrast to the backtest which evaluates out-of-sample prediction).

**Downloads**: `stats`.

### compute_marketing_vs_baseline
Shows the split between marketing-driven KPI and organic/baseline KPI over time. Answers: "how much does my marketing actually move the needle vs. organic trends?"

**Downloads**: `contribution`.

### compute_prior_vs_posterior (Channel Uncertainty Drivers)
Diagnostic tool that decomposes why a channel's confidence interval is wide. Separates uncertainty due to low spend signal vs. correlation with other channels or the baseline.

**Downloads**: check `results.downloads` after completion.

### compute_daily_spend_vs_KPI
Shows daily spend per channel vs. the modeled KPI. Also produces correlation coefficients between channels — useful for identifying pairs of channels that may be confounded in the model.

**Downloads**: `correlations`.

### compute_share_of_spend_vs_effect
Shows each channel's (share of effect − share of spend) over time at a chosen granularity. Positive = overperforming (more effect than spend share), negative = underperforming. Trends over time reveal whether channel efficiency is improving or declining.

**Downloads**: check `results.downloads` after completion.

### compute_roi_cpa_waterfall_plots
Decomposes ROI/CPA into its drivers: baseline ROI, context variables, saturation effects, changing saturation, and seasonal/weekly effects. Answers: "why does Recast estimate this ROI?"

**Downloads**: check `results.downloads` after completion.

### compute_backtest_summaries
Out-of-sample backtest results showing how well the model predicts data it wasn't trained on. Model diagnostic.

**Downloads**: none in current version.

### compute_model_configuration
Exports model configuration tables: priors, ROI settings, shift parameters, spike definitions, and channel linkings.

**Downloads**: `tables-baseline`, `tables-roi`, `tables-shifts`, `tables-spikes`, `tables-channel_linkings`.

### compute_experiments_summaries
Experiment results summary. Only available when experiments are configured on the deployment.

**Downloads**: none in current version.

### compute_clean_data
Exports the clean input data used by the model.

**Downloads**: `clean_data`.

### compute_channel_uncertainty_drivers
Channel uncertainty diagnostic report.

**Downloads**: check `results.downloads` after completion.

---

## Form Fields by Report Type

### Group 1 — deployment_id only
`compute_backtest_summaries`, `compute_experiments_summaries`, `compute_clean_data`, `compute_model_configuration`, `compute_spike_detail_summary`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_backtest_summaries"
}
```

### Group 2 — Date Range
`compute_insights_overview`, `compute_spend_summary`, `compute_period_summary`, `compute_marketing_vs_baseline`, `compute_lower_funnel_waterfall`, `compute_in_sample_model_fit`, `compute_context_variable_summary`, `compute_channel_uncertainty_drivers`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_insights_overview",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31"
}
```

### Group 3 — Date Range + Channels
`compute_roi_cpa_waterfall_plots`, `compute_upper_funnel_details`, `compute_prior_vs_posterior`, `compute_daily_spend_vs_KPI`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_roi_cpa_waterfall_plots",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "channels": ["meta_prospecting", "meta_retargeting", "linear_tv"]
}
```

### Group 4 — Date Range + include_spikes
`compute_baseline_summary`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_baseline_summary",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "include_spikes": true
}
```

### Group 5 — Date Range + Granularity
`compute_share_of_spend_vs_effect`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_share_of_spend_vs_effect",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "granularity": "weekly"
}
```

`granularity` must be one of: `"daily"`, `"weekly"`, `"monthly"`.

### Group 6 — Channels Only
`compare_shift_curves`

```json
{
  "deployment_id": 5716,
  "report_type": "compare_shift_curves",
  "channels": ["meta_prospecting", "linear_tv"]
}
```

### Group 7 — Single Date + num_days + Channels
`compute_spend_response_curves`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_spend_response_curves",
  "date": "2024-03-31",
  "num_days": 14,
  "channels": ["meta_prospecting", "meta_retargeting", "linear_tv"]
}
```

`num_days` must be between 1 and 90. `date` can be historical or up to 730 days in the future from the model's last date. The report uses actual spend from the `num_days` leading up to `date` as the anchor point for the saturation curve.

### Group 8 — Date Range + Channels + spend + include_lower_funnel_effects
`compute_fixed_spend_performance`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_fixed_spend_performance",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "channels": ["meta_prospecting", "linear_tv"],
  "include_lower_funnel_effects": "false",
  "spend": 50000.0
}
```

`include_lower_funnel_effects` is a **string** `"true"` or `"false"` — not a JSON boolean.

### Group 9 — Date Range + channel_groups + include_lower_funnel_effects
`compute_grouped_channel_summaries`

```json
{
  "deployment_id": 5716,
  "report_type": "compute_grouped_channel_summaries",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "channel_groups": [
    { "name": "Paid Social", "channels": ["meta_prospecting", "meta_retargeting"] },
    { "name": "TV & Audio", "channels": ["linear_tv", "podcast"] }
  ],
  "include_lower_funnel_effects": "true"
}
```

`include_lower_funnel_effects` is a **string** `"true"` or `"false"`. Each `channel_groups` entry needs a `name` and a non-empty `channels` array.

### Group 10 — Two Date Ranges
`compare_time_periods`

```json
{
  "deployment_id": 5716,
  "report_type": "compare_time_periods",
  "previous_start_date": "2024-01-01",
  "previous_end_date": "2024-03-31",
  "period_start_date": "2024-04-01",
  "period_end_date": "2024-06-30"
}
```

The previous period end date must come **strictly before** the current period start date. Overlapping or same dates return 422.

---

## Request Body Structure

The create endpoint wraps the form:

```json
{
  "name": "string (optional)",
  "show_in_ui": false,
  "form": {
    "deployment_id": 5716,
    "report_type": "...",
    "...other form fields..."
  }
}
```

**`report_type` always goes inside `form`** — never at the top level.

---

## Recommended Workflow

### Step 0 (optional): Check for a pre-rendered report first

Every page in the Insights dashboard is a pre-rendered version of a Reporter
report, run automatically on a fixed schedule (whenever the model refreshes).
Only some `report_type`s have a pre-rendered version — see the
"Pre-rendered?" column in the Report Type Reference table.

For the five report types that take no inputs besides `deployment_id`
(`compute_backtest_summaries`, `compute_experiments_summaries`,
`compute_clean_data`, `compute_model_configuration`,
`compute_spike_detail_summary`), the pre-rendered and a custom-created
version are always identical — there's nothing that could differ — so it's
always safe to use the pre-rendered one instead of creating a new report.

For the other pre-rendered-eligible report types (e.g.
`compute_insights_overview`, `compute_baseline_summary`), the pre-rendered
version uses fixed inputs tied to the dashboard (e.g. a standard date range)
that may not match what the client actually wants. Check the report's
`form` field after fetching it to confirm the inputs match before treating
it as satisfying the client's request — otherwise create a custom report
instead.

```python
resp = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
    headers=HEADERS,
    params={"include_prerendered": "true"},
).json()
prerendered = [
    r for r in resp["data"]
    if r.get("prerendered") and r["report_type"] == "compute_insights_overview"
]
```

Without `include_prerendered=true`, the list endpoint only returns the
client's own custom-created reports — pre-rendered ones are hidden by
default. A matching pre-rendered report's `id` can be passed straight to the
show endpoint like any other report, then downloaded normally (Step 5).

### Step 1: Get the deployment_id (if needed)

```python
kpis = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/kpis", headers=HEADERS).json()["data"]
kpi_detail = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/kpis/{kpis[0]['id']}", headers=HEADERS).json()
dep_id = kpi_detail["depvar_configurations"][0]["deployment_id"]
```

Or from the Deployments endpoint:

```python
deployments = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments", headers=HEADERS).json()["data"]
dep_id = deployments[0]["id"]  # pick the active deployment
```

### Step 2: Get valid channel names (when needed)

```python
dep = requests.get(f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments/{dep_id}", headers=HEADERS).json()
all_channels     = dep["spend_channels_labels"]
upper_funnel     = dep["upper_funnel_channel_labels"]
lower_funnel     = dep["lower_funnel_channel_labels"]
```

Use `spend_channels_labels` for channel inputs. For `compute_grouped_channel_summaries`, use only `upper_funnel_channel_labels` (lower funnel channels are handled via `include_lower_funnel_effects`).

### Step 3: Create the report

```python
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "name": "Q1 2024 Attribution",
        "show_in_ui": False,
        "form": {
            "deployment_id": dep_id,
            "report_type": "compute_insights_overview",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        },
    },
)
assert resp.status_code == 201, f"Create failed: {resp.text}"
report_id = resp.json()["id"]
```

### Step 4: Poll until complete

```python
import time

timeout_seconds = 15 * 60
started_at = time.time()

while True:
    if time.time() - started_at > timeout_seconds:
        raise TimeoutError("Timed out waiting for report to complete")
    result = requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports/{report_id}",
        headers=HEADERS,
    ).json()
    print(f"Status: {result['status']}")
    if result["status"] not in ("ready", "processing"):
        break
    time.sleep(30)

assert result["status"] == "success", f"Report ended with status: {result['status']}"
```

### Step 5: Download CSVs

```python
import io, pandas as pd

for dl in result["results"]["downloads"]:
    csv_resp = requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports/{report_id}/downloads/{dl['key']}",
        headers={**HEADERS, "Accept": "text/csv"},
    )
    df = pd.read_csv(io.StringIO(csv_resp.text))
    df.to_csv(f"{dl['key']}.csv", index=False)
    print(f"Saved {dl['key']}.csv ({len(df)} rows)")
    print(df.head())
```

---

## Common Scenarios with Full Examples

### Scenario 1: Channel attribution waterfall for Q1

```python
import os, time, io, requests, pandas as pd

BASE_URL = "https://api.getrecast.com"
CLIENT_SLUG = "democlient"
PAT = os.environ["RECAST_PAT"]
HEADERS = {"Authorization": f"Bearer {PAT}", "Accept": "application/json"}

resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "name": "Q1 2024 Attribution Waterfall",
        "show_in_ui": False,
        "form": {
            "deployment_id": 5716,
            "report_type": "compute_insights_overview",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        },
    },
)
assert resp.status_code == 201, f"Failed: {resp.text}"
report_id = resp.json()["id"]

timeout_seconds = 15 * 60
started_at = time.time()

while True:
    if time.time() - started_at > timeout_seconds:
        raise TimeoutError("Timed out waiting for report to complete")
    result = requests.get(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports/{report_id}", headers=HEADERS
    ).json()
    print(f"Status: {result['status']}")
    if result["status"] not in ("ready", "processing"):
        break
    time.sleep(30)

if result["status"] == "success":
    for dl in result["results"]["downloads"]:
        csv_resp = requests.get(
            f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports/{report_id}/downloads/{dl['key']}",
            headers={**HEADERS, "Accept": "text/csv"},
        )
        df = pd.read_csv(io.StringIO(csv_resp.text))
        df.to_csv(f"{dl['key']}.csv", index=False)
        print(f"Saved {dl['key']}.csv ({len(df)} rows)")
```

### Scenario 2: Compare Q1 vs Q2

```python
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "name": "Q1 vs Q2 2024",
        "show_in_ui": False,
        "form": {
            "deployment_id": 5716,
            "report_type": "compare_time_periods",
            "previous_start_date": "2024-01-01",
            "previous_end_date": "2024-03-31",
            "period_start_date": "2024-04-01",
            "period_end_date": "2024-06-30",
        },
    },
)
assert resp.status_code == 201, f"Failed: {resp.text}"
```

### Scenario 3: Grouped channel performance

```python
resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "name": "Grouped Channel Performance Q1",
        "show_in_ui": False,
        "form": {
            "deployment_id": 5716,
            "report_type": "compute_grouped_channel_summaries",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
            "channel_groups": [
                {"name": "Paid Social", "channels": ["meta_prospecting", "meta_retargeting"]},
                {"name": "TV & Audio", "channels": ["linear_tv", "podcast"]},
                {"name": "Search", "channels": ["search_non_branded"]},
            ],
            "include_lower_funnel_effects": "true",
        },
    },
)
# Poll and download same as Scenario 1
# Download keys follow pattern: group_summaries-{group_name}-{metric}-{granularity}
# e.g. "group_summaries-Paid Social-roi-summary_monthly"
```

### Scenario 4: Same report across multiple date ranges

```python
date_ranges = [
    ("2024-01-01", "2024-03-31", "Q1 2024"),
    ("2024-04-01", "2024-06-30", "Q2 2024"),
    ("2024-07-01", "2024-09-30", "Q3 2024"),
]

report_ids = {}
for start, end, label in date_ranges:
    resp = requests.post(
        f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={
            "name": f"Waterfall {label}",
            "show_in_ui": False,
            "form": {
                "deployment_id": 5716,
                "report_type": "compute_insights_overview",
                "start_date": start,
                "end_date": end,
            },
        },
    )
    assert resp.status_code == 201, f"Failed for {label}: {resp.text}"
    report_ids[label] = resp.json()["id"]
    print(f"Created {label}: id={report_ids[label]}")

# Poll all to completion
for label, rid in report_ids.items():
    timeout_seconds = 15 * 60
    started_at = time.time()
    while True:
        if time.time() - started_at > timeout_seconds:
            raise TimeoutError(f"Timed out waiting for {label} to complete")
        result = requests.get(
            f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports/{rid}", headers=HEADERS
        ).json()
        if result["status"] not in ("ready", "processing"):
            print(f"{label}: {result['status']}")
            break
        time.sleep(30)
```

### Scenario 5: Spend response curves (saturation analysis)

```python
# First get valid channel names from the deployment
dep = requests.get(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/deployments/{dep_id}", headers=HEADERS
).json()
channels = dep["upper_funnel_channel_labels"]

resp = requests.post(
    f"{BASE_URL}/v1/clients/{CLIENT_SLUG}/reports",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "name": "Spend Response Curves — 14 Day",
        "show_in_ui": False,
        "form": {
            "deployment_id": dep_id,
            "report_type": "compute_spend_response_curves",
            "date": "2024-03-31",
            "num_days": 14,
            "channels": channels,
        },
    },
)
assert resp.status_code == 201, f"Failed: {resp.text}"
# Download key: multi_day-multi_channel-tables-full_table
```

---

## Common Mistakes to Avoid

1. **Putting `report_type` at the top level** — It belongs inside `form`. The Swagger spec shows it at top level; the actual API requires it in `form`. This is the most common cause of 400/422 errors.

2. **Forgetting `deployment_id`** — Every report requires `deployment_id` inside the form. It is not optional.

3. **Using `include_lower_funnel_effects` as a boolean** — This field is a **string** `"true"` or `"false"`, not a JSON boolean `true` / `false`. Applies to `compute_fixed_spend_performance` and `compute_grouped_channel_summaries`.

4. **Date order violations in `compare_time_periods`** — The previous period's `end_date` must come strictly before the current period's `start_date`. Overlapping ranges return 422.

5. **Invalid `granularity` value** — `compute_share_of_spend_vs_effect` only accepts `"daily"`, `"weekly"`, or `"monthly"`. Anything else returns 422.

6. **`num_days` out of range** — `compute_spend_response_curves` requires `num_days` between 1 and 90. Zero and values over 90 return 422.

7. **Wrong channel names** — Channel names must exactly match the model's labels. Use `spend_channels_labels` from the Deployments endpoint to get valid names.

8. **Empty `channels` array** — Reports that require channels (Groups 3, 6, 7, 8) return 422 if `channels` is an empty array.

9. **Not polling for both statuses** — Both `"ready"` and `"processing"` mean the report is still running. Poll until status is neither.

10. **Accessing `results` before success** — `results` is only present in the show response when `status == "success"`. Don't try to access `results.downloads` on a running or failed report.

11. **Forgetting the `data` wrapper on the list endpoint** — `GET /v1/clients/{client_slug}/reports` returns `{"data": [...], "pagination": {...}}`. Access `response["data"]` to get the array. The show endpoint (`GET /v1/clients/{client_slug}/reports/{id}`) returns the object directly with no wrapper.

12. **`compute_context_variable_summary` without context variables** — This report only works for deployments with contextual variables configured. If the deployment doesn't have them, the report will error.

13. **`end_date` before or equal to `start_date`** — For all date range reports, `end_date` must be after `start_date`. Same-date ranges may return 422.

14. **Invalid date format** — All dates must be `YYYY-MM-DD`. Other formats (e.g., `MM-DD-YYYY`) return 422.

15. **Assuming every `report_type` has a pre-rendered version** — only the types marked "Yes" in the Report Type Reference table's "Pre-rendered?" column do. Check the `prerendered`-filtered list rather than assuming one exists for an arbitrary report_type.

---

## Code Generation Rules

**General:**
- Load the PAT from an environment variable: Python uses `os.environ["RECAST_PAT"]`, R uses `Sys.getenv("RECAST_PAT")`. Teach the user how to set their own environment variable.
- NEVER print, log, or display the token.
- Base URL: `https://api.getrecast.com`
- All report endpoints are under `/v1/clients/{client_slug}/reports`.
- Auth: Bearer token in the Authorization header.
- Always set `show_in_ui = False` unless the client specifically asks to see results in the UI.
- Include error handling that shows the response body on non-200/201 responses.
- Poll for completion with a 30-second interval; add a timeout (for example, 15 minutes) to avoid infinite loops.
- Check for both `"ready"` and `"processing"` statuses when polling.

**Python specific:**
- Use `requests` and `pandas`
- Use f-strings for URL construction
- Parse CSV with `pd.read_csv(io.StringIO(resp.text))`
- Use `copy.deepcopy()` when modifying form templates in loops

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
| GET | `/v1/clients/{client_slug}/reports` | List reports (paginated: `?page=1&per_page=25`; filter: `?report_type=...`) |
| GET | `/v1/clients/{client_slug}/reports/{id}` | Show report detail (returned directly, no `data` wrapper) |
| POST | `/v1/clients/{client_slug}/reports` | Create report |
| GET | `/v1/clients/{client_slug}/reports/{id}/downloads/{key}` | Download CSV (set `Accept: text/csv`) |

### Create response

```json
{ "id": 12345 }
```

### List response structure

```json
{
  "data": [
    {
      "id": 123,
      "name": "string",
      "report_type": "string",
      "status": "string",
      "prerendered": false,
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "pagination": { "page": 1, "per_page": 25, "total_pages": 3, "total_count": 52 }
}
```

Filter by type: `GET /v1/clients/{client_slug}/reports?report_type=compute_insights_overview`

Include pre-rendered reports (excluded by default): `GET /v1/clients/{client_slug}/reports?include_prerendered=true`. Pre-rendered reports (the ones backing the Insights dashboard) are tagged `"prerendered": true`; the client's own custom-created reports are `"prerendered": false`.

### Show response structure (no wrapper)

```json
{
  "id": 123,
  "name": "string",
  "report_type": "string",
  "status": "ready | processing | success | error",
  "prerendered": false,
  "form": { "deployment_id": 5716, "report_type": "...", "..." : "..." },
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "results": {
    "downloads": [
      { "description": "string", "key": "string" }
    ]
  }
}
```

`results` is only present when `status == "success"`.

### Download response

Table download keys return `text/csv`. Access with a plain GET — setting `Accept: text/csv` is recommended to force CSV responses.

---

## Download Keys Reference

| `report_type` | Download keys |
|---|---|
| `compute_insights_overview` | `summaries-total-impact_shifted`, `summaries-direct-impact_shifted`, `summaries-total-impact_unshifted`, `summaries-direct-impact_unshifted`, `summaries-total-roi`, `summaries-direct-roi`, `summaries-total-mroi`, `summaries-direct-mroi` |
| `compute_baseline_summary` | `summary_total`, `summary_monthly`, `summary_daily` |
| `compare_shift_curves` | `all_shift_curves_summarized` |
| `compute_spend_response_curves` | `multi_day-multi_channel-tables-full_table` |
| `compare_time_periods` | `summary-overall`, `summary-time_table` |
| `compute_grouped_channel_summaries` | `group_summaries-{group_name}-{metric}-{granularity}` — e.g. `group_summaries-Paid Social-roi-summary_monthly` |
| `compute_spend_summary` | `tables-daily`, `tables-weekly`, `tables-monthly`, `tables-total` |
| `compute_spike_detail_summary` | `individual_daily_effects`, `individual_cumulative_effects`, `individual_cumulative_effects_summarized`, `grouped_daily_effects`, `grouped_cumulative_effects`, `grouped_cumulative_effects_summarized` |
| `compute_period_summary` | `summary_tables-merged_means_summary`, `summary_tables-total_effect`, `summary_tables-in_period_effect`, `summary_tables-after_period_effect`, `summary_tables-future_effect`, `summary_tables-observed_roi`, `summary_tables-true_roi`, `summary_tables-pre_period_effect` |
| `compute_lower_funnel_waterfall` | `channel_summaries-{lower_funnel_channel}-summary_table` (one per lower funnel channel), `daily_effect-table` |
| `compute_upper_funnel_details` | `channel_summaries-{channel}-summary_table` (one per selected channel) |
| `compute_in_sample_model_fit` | `stats` |
| `compute_marketing_vs_baseline` | `contribution` |
| `compute_daily_spend_vs_KPI` | `correlations` |
| `compute_clean_data` | `clean_data` |
| `compute_model_configuration` | `tables-baseline`, `tables-roi`, `tables-shifts`, `tables-spikes`, `tables-channel_linkings` |
| `compute_backtest_summaries` | *(none in current version)* |
| `compute_experiments_summaries` | *(none in current version)* |

For report types not listed, check `result["results"]["downloads"]` after completion — download keys are dynamic (e.g. they may vary based on which channels or groups were included).

---

## Glossary

| Client says | `report_type` |
|---|---|
| "channel attribution / what's working?" | `compute_insights_overview` |
| "organic / baseline / intercept" | `compute_baseline_summary` |
| "adstock / time delay / carryover" | `compare_shift_curves` |
| "saturation curves / response curves" | `compute_spend_response_curves` |
| "before vs after / compare periods" | `compare_time_periods` |
| "grouped channels / custom groups" | `compute_grouped_channel_summaries` |
| "fixed spend / performance at $X" | `compute_fixed_spend_performance` |
| "how much was spent?" | `compute_spend_summary` |
| "promotions / spikes / holidays" | `compute_spike_detail_summary` |
| "in-period vs post-period effects" | `compute_period_summary` |
| "lower funnel drivers / branded search source" | `compute_lower_funnel_waterfall` |
| "upper funnel + lower funnel ROI" | `compute_upper_funnel_details` |
| "contextual factors / price / brand awareness" | `compute_context_variable_summary` |
| "model fit / in-sample accuracy" | `compute_in_sample_model_fit` |
| "marketing share vs organic share" | `compute_marketing_vs_baseline` |
| "CI width / uncertainty / why is interval wide?" | `compute_prior_vs_posterior` |
| "correlations between channels" | `compute_daily_spend_vs_KPI` |
| "over/underperforming channels over time" | `compute_share_of_spend_vs_effect` |
| "why is my ROI this value? / ROI drivers" | `compute_roi_cpa_waterfall_plots` |
| "backtest / out-of-sample" | `compute_backtest_summaries` |
| "model config / priors / parameters" | `compute_model_configuration` |
| "raw data / data export" | `compute_clean_data` |
| "uncertainty / breakdown of roi/ breakdown of cpa" | `compute_channel_uncertainty_drivers` |

## Resources

- https://docs.getrecast.com/docs/reporter
