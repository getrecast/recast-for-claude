---
name: optimizer-api
description: Use when optimizing or allocating marketing budget with the Recast Optimizer API — "maximize revenue with $2M", "optimal channel mix", "allocate budget under constraints", "in-flight reallocation". Translates goals into API requests covering objectives, constraints, channel budgets, multi-KPI, and common pitfalls. Optimizer prescribes the budget to hit a goal; to predict outcomes of a known budget, use forecaster-api instead.
---

# Recast Optimizer API — Translating Goals to API Requests

You are helping a Recast client use the Optimizer API to run budget optimizations programmatically. Your job is to understand what they want to achieve, then build the correct `form` payload for `POST /v1/clients/{client_slug}/optimizations`.

## Conversation Flow

### 1. Gather context

Ask the client these questions naturally (one or two at a time):

- **Start fresh or update a previously-run optimization?** Establish this first.
  - **Fresh question** ("what's the best mix for $2M in Q4?") → build a clean form. **Workflow A.**
  - **Update a specific past run** ("same setup as the Q3 plan, but $500K more") → ask for the URL (`https://app.getrecast.com/clients/[client_slug]/optimizations/[id]`) or ID. **Workflow B.**

  If they're answering a new question, do **not** start from an old optimization. Its bounds, caps, committed spend, and objective were authored for a different question. Prefer explicit instruction from the user vs inheriting implicit constraints from an irrelevant optimization.
- **If Workflow B, what specifically changes?** Show all the existing assumptions, then walk the user part-by-part through what they might want to change. Some common scenarios:
  - Run variations with different **total spend** amounts
  - Change the **target** (goal value)
  - Shift the **date range** (constraint start/end dates)
  - Change the **objective** (depvar, profit, roi)
  - Adjust **channel budget** min/max bounds
  - Modify **channel settings** (committed spend, drop days)
  - Switch which **depvars/models** are selected or change **multiplier weights**
  - Change the **confidence** level
  - Toggle **optimize_for_insample_effect**
- **Scale**: Single optimization or looping over multiple variations?
- **Output**: What results do they care about?
  - Top-level numbers (expected_revenue, recommended_total_spend, expected_earned_roi, expected_paid_roi)
  - Specific CSV downloads (keys from results — e.g., channel_summary, final_budget)
  - All downloads

Don't ask about coding language. If they specify one, use it. Otherwise use Python, assume minimal dependencies, and give step-by-step execution instructions.

### 2. Confirm understanding

Before generating code, summarize:
- Which workflow: **A** (new optimization) or **B** (update an existing one, with its ID)
- The goal, in the client's words, and the fields it maps to: `objective`, `target`, `confidence` or `strategy`, the date range, and the budget (`spend_scope` / `total_spend`)
- Which channel constraints came from the client — and, for everything they didn't mention, that it's unconstrained (A) or carried over from the source optimization (B)
- How many variations (if looping)
- What output will be captured

### 3. Generate code

Write a single, self-contained script following the rules in the Code Generation section below.

---

## Understanding the Optimizer: Objectives Deep Dive

The `objective` field determines what the optimizer tries to achieve. Getting this right is the most important decision.

### Profit (`objective = "profit"`)

**What it does:** Maximizes `weighted_KPI x contribution_margin - total_spend`.

**When to use:** Client says "best bang for my buck", "maximize net return", "best use of money."

**Required form fields:**
- `strategy`: `"conservative"`, `"base"`, or `"aggressive"` (replaces explicit contribution_margin)
- `confidence`: set to `null`
- `target`: If using an ROI model, target represents the contribution margin to use when calculating profit after COGS. If using a CPA model, target represents the average value per conversion.

**Key behaviors:**
- This is the only objective that produces "textbook" results where marginal ROI equalizes across channels.
- Results are intuitive: every dollar is allocated where it produces the most net profit.

### Efficiency/ROI (`objective = "roi"`)

**What it does:** First ensures the ROI target is met at the specified confidence level, then maximizes total KPI volume.

**When to use:** Client says "I need at least 3x ROI", "my CPA needs to be under $50", "maintain efficiency."

**Required form fields:**
- `target`: The ROI floor as a string. **Always expressed as ROI (outcome/spend), even for CPA models.** For CPA models: target CPA of $50 means target ROI = 1/50 = 0.02, so `"target": "0.02"`. Never pass the raw CPA number.
- `confidence`: String 0-100 (e.g., `"75"` for 75% confident)

**Key behaviors:**
- Results may seem non-intuitive: some channels may have very different marginal ROIs because the optimizer is volume-seeking after satisficing the ROI constraint.
- With quantile targeting (confidence > 50), the optimizer penalizes high-variance channels and favors predictable ones, even if their mean returns are lower.

### Volume/Depvar (`objective = "depvar"`)

**What it does:** Finds the cheapest way to hit the KPI target at the confidence level, then maximizes efficiency with remaining budget flexibility.

**When to use:** Client says "I need to hit $5M revenue", "I need 10,000 acquisitions", "reach X goal."

**Required form fields:**
- `target`: The KPI floor as a string (e.g., `"5000000"`)
- `confidence`: String 0-100 (e.g., `"75"`)

**Key behaviors:**
- The optimizer satisfices first (hit the target), then optimizes (maximize ROI).
- Higher confidence = more conservative allocation = more total spend needed.

### Choosing for the client

| Client says | Use objective | Set target to |
|---|---|---|
| "best use of money" | `"profit"` | `"0"` |
| "I need at least 3x ROI" | `"roi"` | `"3.0"` |
| "CPA under $50" | `"roi"` | `"0.02"` (= 1/50) |
| "Hit $5M revenue" | `"depvar"` | `"5000000"` |
| "10,000 acquisitions" | `"depvar"` | `"10000"` |
| "Doesn't know" | `"profit"` | `"0"` |

### Confidence level guide

The `confidence` field is a string 0-100 (NOT 0-1 like the internal API):
- `"50"` = expected case (median). Mean targeting — good for profit maximization.
- `"75"` = 75% confident you'll hit the target. Good default for ROI/depvar.
- `"90"` = very conservative. 90% confident.
- `null` = required when objective is `"profit"`.

Present results as: "With 75% confidence, you'll achieve at least X."

**When confidence matters:** For `roi` and `depvar` objectives, confidence controls quantile targeting. At `"75"`, the optimizer ensures the 25th percentile of the outcome distribution meets the target — meaning there's a 75% chance you'll do at least that well. Without confidence (or at `"50"`), the optimizer just targets the mean, which does NOT reliably guarantee hitting the target due to distribution skewness.

---

## The Form Schema — Complete Reference

```json
{
  "objective": "depvar | profit | roi",
  "target": "string numeric >= 0",
  "confidence": "string numeric 0-100 (null if objective is profit)",
  "strategy": "conservative | base | aggressive | null (required if objective is profit)",
  "kpi_id": "UUID string or 'custom'",
  "spend_scope": "'' | 'upper_funnel' | 'total'",
  "total_spend": "string integer (required if spend_scope is 'total')",
  "exact_spend": "string integer (required if spend_scope is 'upper_funnel')",
  "optimize_for_insample_effect": "'T' | 'F'",
  "custom_model_type": "string — REQUIRED, cannot be blank or null. Use the client's model type: \"roi\" (revenue-type models) or \"cpa\" (cost-per-acquisition models)",
  "budget": "2D array of context variables or []",
  "constraints": [
    {
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "channel_budgets": [
        {
          "min": "string numeric",
          "max": "string numeric (>= min)",
          "unoptimized": "boolean | null",
          "channels": [
            {
              "name": "string (valid channel name)",
              "committed_spend": 0,
              "drop_days": 1
            }
          ]
        }
      ],
      "limit_spend": "boolean | null",
      "lower_funnel_caps": {
        "channel_name": {
          "option": "off | manual | uncapped | capped | optimize",
          "cap": "string — set if capped (e.g. \"100000\"), else \"\"",
          "min": "string — set if optimize, else \"0\"",
          "max": "string — set if optimize, else \"\""
        }
      }
      // ALL four keys must be present on every channel entry; unused fields
      // are empty strings ("" — min defaults to "0"), and all values are
      // STRINGS, not integers. Example of a valid entry:
      //   "affiliates":  {"cap": "", "max": "", "min": "0", "option": "off"}
      //   "sem_branded": {"cap": "", "max": "", "min": "0", "option": "manual"}
      //
      // Options:
      //   off      — channel excluded entirely (use for a 0/0 constraint;
      //              do NOT encode exclusion as capped with cap 0)
      //   manual   — spend exactly what the uploaded budget provides
      //              (use for LF channels with planned spend and no cap)
      //   uncapped — no limit
      //   capped   — total spend limited to `cap` over the period
      //   optimize — optimizer chooses spend within [min, max]
    }
  ],
  "depvar_configurations": [
    {
      "deployment_id": "integer",
      "multiplier": "float (default 1.0)",
      "selected": "boolean",
      "name": "string",
      "spikes": [
        { "name": "string", "dates": ["YYYY-MM-DD"] }
      ]
    }
  ]
}
```

---

## Translating Client Asks to Form Fields

### Total budget control

| Client says | Form fields to set |
|---|---|
| "I have $2M total budget" | `spend_scope: "total"`, `total_spend: "2000000"` |
| "I want to spend exactly $500K on upper funnel" | `spend_scope: "upper_funnel"`, `exact_spend: "500000"` |
| "No total budget constraint" | `spend_scope: ""` (or `null`) |

### Channel-level constraints (via `constraints[].channel_budgets[]`)

Each `channel_budgets` entry represents a group of channels with shared min/max bounds. The optimizer allocates within those bounds.

| Client says | How to set it |
|---|---|
| "Meta should be $300K-$600K" | One `channel_budgets` entry: `{"min": "300000", "max": "600000", "channels": [{"name": "meta_prospecting"}, {"name": "meta_retargeting"}]}` |
| "TV at least $200K" | `{"min": "200000", "max": "<some_high_number>", "channels": [{"name": "linear_tv"}]}` |
| "Don't optimize email" | `{"unoptimized": true, "channels": [{"name": "email"}]}` — omit min/max |
| "Cap search at $100K" | `{"min": "0", "max": "100000", "channels": [{"name": "paid_search"}]}` |

**Critical rules:**
- `min` and `max` are **strings**, not numbers.
- `min` must be <= `max`.
- Channel max bounds cover only the optimized upper-funnel allocation. The total spend constraint applies to the whole budget — uploaded baseline + optimized allocation + model-predicted lower-funnel spend — so the sum of max values does not have to reach total_spend on its own. If the bounds are tighter than the total spend constraint, the optimizer doesn't error: total spend is a penalty term in the objective, so the run succeeds and simply lands below target.
- Every channel that should be optimized MUST appear in a `channel_budgets` entry with finite min and max. Channels not listed are not optimized.
- To bound a set of channels together (e.g., "all Meta combined"), put them in the same `channel_budgets` entry. The entry constrains their **combined** spend; the optimizer allocates between them within that bound. Don't split the client's stated total into per-channel entries using invented percentages — that removes the optimizer's freedom to choose the split.

### Channel settings

| Client says | Channel field |
|---|---|
| "TV only runs monthly" | `drop_days: 30` on the TV channel |
| "Minimum $10K/month on each channel" | `committed_spend: 10000` on each channel |
| "Podcasts every other week" | `drop_days: 14` |
| "Spend daily on social" | `drop_days: 1` (default) |

`drop_days` aligns the optimizer with how the model was trained. If the model learned from pulsed (non-daily) spending, the optimizer must respect that pattern. Without it, the optimizer spreads spend daily, misaligning with the modeled saturation curve.

### Date range

Set `constraints[].start_date` and `constraints[].end_date`:
- "Q2" → `start_date: "2026-04-01"`, `end_date: "2026-06-30"`
- "Next month" → first to last day of next month
- "Rest of year" → today through December 31

Dates must be within the model's forecast window. Use the KPIs endpoint to understand what's available.

### Lower funnel channels

Lower funnel channels (e.g., branded search) are predicted by the model from upper funnel activity — they're not directly controlled. Use `lower_funnel_caps` to limit them:

```json
"lower_funnel_caps": {
  "Branded Search": {
    "option": "capped",
    "cap": 150000
  }
}
```

Options:
- `"uncapped"`: No limit (default)
- `"capped"`: Set a maximum total spend for the period
- `"optimize"`: Let the optimizer choose within min/max bounds

**Do NOT put lower funnel channels in `channel_budgets`.** They are handled separately.

### Multi-KPI optimizations

When optimizing across multiple models (e.g., revenue + conversions):

1. **`depvar_configurations`**: Include multiple entries, each with a `deployment_id` and `multiplier`.
2. **`multiplier`**: The weight applied to each KPI. For multi-KPI profit optimization, the weights effectively ARE the contribution margins:
   - Revenue model (50% margin): `multiplier: 0.5`
   - Conversion model ($100 LTV): `multiplier: 100`
3. **`kpi_id`**: Set to `"custom"` for custom multi-KPI configurations.

**Critical for multi-KPI profit:** The optimizer computes `(w1 * kpi1 + w2 * kpi2) * strategy_factor - spend`. Since `multiplier` and strategy multiply together, encode absolute dollar values in `multiplier` to avoid double-counting.

### Spikes (promotional events)

```json
"depvar_configurations": [
  {
    "deployment_id": 123,
    "multiplier": 1.0,
    "name": "revenue",
    "spikes": [
      { "name": "Prime Day", "dates": ["2026-07-15", "2026-07-16"] }
    ]
  }
]
```

Spike names must match existing spike groups from the model. You cannot create new spike names — only use ones the model was trained with.

---

## Two Workflows — Decide Which One First

| | **Workflow A — new optimization** | **Workflow B — update an existing one** |
|---|---|---|
| Use when | The client is asking a fresh question | The client names a specific past run to re-run differently |
| Constraints | Only what the client asks for; everything else unconstrained | Carried over unchanged except what they named |
| Built from | `/kpis` + `/deployments` | `GET /optimizations/{id}` → `form` |

---

## Workflow A: New optimization

### Step A1: Gather scaffolding from the API

You need real channel names, a live deployment, and valid spike names. Get them from the helper endpoints:

```
GET /v1/clients/{client_slug}/kpis           → pick the KPI
GET /v1/clients/{client_slug}/kpis/{kpi_id}  → depvar_configurations (deployments + spikes),
                                                ready to drop into the form
GET /v1/clients/{client_slug}/deployments/{id}
    ?extra_fields[]=drop_days&extra_fields[]=spend&extra_fields[]=default_budget
                                             → channel labels, model_date, contextual
                                                variable defaults, recommended drop_days
```

The deployment detail returns `upper_funnel_channel_labels`, `lower_funnel_channel_labels`, `contextual_variable_defaults`, and `model_date` — everything structural a form needs.

`extra_fields` is an array parameter accepting `drop_days`, `spend`, and `default_budget`. Request `drop_days` — it gives you Recast's recommended spend frequency per channel, which is what you should put in the form rather than deriving or guessing one. 

`spend` represents the deployment's historical spend and `default_budget` a business-as-usual budget. Neither of these are necessary for running an optimization.

### Step A2: Get the goal fields from the client

Ask for each of these and confirm the answer explicitly before building the form:

- **What are they optimizing for?** → `objective`, plus `target` and either `confidence` (roi/depvar) or `strategy` (profit). See "Understanding the Optimizer: Objectives Deep Dive" above.
- **Over what period?** → `constraints[].start_date` / `end_date`
- **What's the budget, if any?** → `spend_scope`, with `total_spend` (all channels, including lower funnel) or `exact_spend` (upper funnel only). `spend_scope: ""` means no total budget constraint.

### Step A3: Start unconstrained, then add only what the client asked for

Put every upper funnel channel into a **single** `channel_budgets` entry with `min: "0"` and `max` set to a sentinel far above anything the client could spend — `"1000000000"` is fine. The entry bounds the group's combined spend and the optimizer allocates freely between the channels inside it, so this leaves the whole mix open without you having to invent a per-channel ceiling. The real budget is enforced by `total_spend` / `exact_spend`, not by these bounds.

Channels absent from all constraints and the absent from the supplied budget are "turned off" and get **$0**, not "unlimited".

This wide-open run is the "unconstrained recommendation" the docs recommend as a first step: https://docs.getrecast.com/docs/optimizer.md

From here you need to apply the constraints that are reasonable for the client. This will likely require interacting with the client to understand their constraints. This could include:
* hard limits like a contract minimum, a platform ceiling, a channel that's genuinely off
* relative limits like "Use a business-as-usual budget as the starting point, and set all constraints to +/-20%"

Two fields still carry over even in a clean build, because they describe how the model was fit rather than what the client prefers:

- **`drop_days`** for channels that don't spend daily (TV, direct mail, podcasts). Take Recast's recommended values from `GET /deployments/{id}?extra_fields[]=drop_days` rather than deriving or guessing them, then confirm them with the client — they may want to assume a different cadence. Leaving a pulsed channel at `1` misaligns the optimizer with the trained saturation curve.
- **`spikes`** — only names the model was trained with, from the KPI detail response.

Skip to **Submit** below. The full field reference is in "Building a Form from Scratch."

---

## Workflow B: Change an existing optimization

### Step B1: Get the form

```
GET /v1/clients/{client_slug}/optimizations
```
The list is inside `response["data"]` — find the optimization the client named. Then:
```
GET /v1/clients/{client_slug}/optimizations/{id}
```
The show endpoint returns the object directly (no `data` wrapper). Extract `response["form"]`.

### Step B2: Report what it contains — before running anything

The client asked for some things to change explicitly; everything else carries over. Show them what "everything else" is, and have them confirm.

Lead with a link to the source optimization — `https://app.getrecast.com/clients/{client_slug}/optimizations/{id}` — plus its `name` and `created_at`, so they can open it and check the settings themselves. Then summarise, as a table rather than prose:

- the goal fields being carried over: `objective`, `target`, `confidence`/`strategy`, `spend_scope`/`total_spend`, dates
- each `channel_budgets` entry: `min`, `max`, channels — and which channels are absent from all constraints, since those get **$0**, not "unlimited"
- any `lower_funnel_caps` option that isn't the `uncapped` default, and any non-zero `committed_spend`
- whether `form["budget"]` is non-empty — if so, `min`/`max` are **relative to that uploaded budget**, not absolute ceilings

If the bounds don't match what the client expects for the period they're now optimizing, that's a sign this is really a new question — switch to Workflow A.

### Step B3: Modify the form

Make targeted edits. Common modifications:

**Change total spend:**
```python
form["spend_scope"] = "total"
form["total_spend"] = "1500000"
```

**Change objective to profit:**
```python
form["objective"] = "profit"
form["target"] = "0"
form["confidence"] = None
form["strategy"] = "base"
```

**Change objective to ROI target:**
```python
form["objective"] = "roi"
form["target"] = "3.0"     # 3x ROI
form["confidence"] = "75"  # 75% confident
form["strategy"] = None
```

**Adjust channel budget bounds:**
```python
for constraint in form["constraints"]:
    for cb in constraint["channel_budgets"]:
        if not cb.get("unoptimized"):
            # Increase max by 20%
            cb["max"] = str(round(float(cb["max"]) * 1.2))
```

**Shift date range:**
```python
form["constraints"][0]["start_date"] = "2026-07-01"
form["constraints"][0]["end_date"] = "2026-09-30"
```

---

## Submit, Poll, Download (both workflows)

### Submit

```python
POST /v1/clients/{client_slug}/optimizations
{
  "form": form,
  "name": "API - Q3 Budget Sweep $1.5M",
  "show_in_ui": False,
  "use_latest_deployments": True
}
```

### Poll for completion

```
GET /v1/clients/{client_slug}/optimizations/{new_id}
```
Poll every 30 seconds until `status != "processing"`. Typical runtime: 1-6 minutes.

### Download results

```
GET /v1/clients/{client_slug}/optimizations/{id}/downloads/{key}
```
Set `Accept: text/csv` header. Download keys come from `results[].downloads[].key`.

---

## Building a Form from Scratch

### Minimum viable form

```json
{
  "objective": "profit",
  "target": "0",
  "confidence": null,
  "strategy": "base",
  "spend_scope": "total",
  "total_spend": "1000000",
  "optimize_for_insample_effect": "F",
  "budget": [],
  "depvar_configurations": [
    {
      "deployment_id": 456,
      "multiplier": 1.0,
      "name": "revenue",
      "spikes": []
    }
  ],
  "constraints": [
    {
      "start_date": "2026-04-01",
      "end_date": "2026-06-30",
      "channel_budgets": [
        {
          "min": "50000",
          "max": "500000",
          "channels": [
            { "name": "meta_prospecting", "committed_spend": 0, "drop_days": 1 },
            { "name": "meta_retargeting", "committed_spend": 0, "drop_days": 1 }
          ]
        },
        {
          "min": "100000",
          "max": "300000",
          "channels": [
            { "name": "linear_tv", "committed_spend": 0, "drop_days": 30 }
          ]
        }
      ]
    }
  ]
}
```


---

## Common Scenarios with Full Examples

These all assume **Workflow B** — a named existing optimization, varied along one axis. For a new question, build the form per Workflow A instead.

### Scenario 1: "Run 5 variations with different total spend"

```python
base_form = get_template_form(optimization_id)
spend_levels = [500000, 750000, 1000000, 1500000, 2000000]

for spend in spend_levels:
    form = copy.deepcopy(base_form)
    form["spend_scope"] = "total"
    form["total_spend"] = str(spend)
    create_and_poll(form, name=f"Sweep ${spend:,}")
```

### Scenario 2: "What ROI can I maintain at different budgets?"

```python
base_form = get_template_form(optimization_id)
base_form["objective"] = "roi"
base_form["confidence"] = "75"
base_form["strategy"] = None

for target_roi in [2.0, 2.5, 3.0, 3.5, 4.0]:
    form = copy.deepcopy(base_form)
    form["target"] = str(target_roi)
    create_and_poll(form, name=f"ROI Target {target_roi}x")
```

### Scenario 3: "Double Meta spend, cut TV"

```python
form = copy.deepcopy(base_form)
for constraint in form["constraints"]:
    for cb in constraint["channel_budgets"]:
        channel_names = [ch["name"] for ch in cb["channels"]]
        if any("meta" in name for name in channel_names):
            cb["min"] = str(round(float(cb["min"]) * 2))
            cb["max"] = str(round(float(cb["max"]) * 2))
        if any("tv" in name for name in channel_names):
            cb["max"] = str(round(float(cb["max"]) * 0.5))
```

### Scenario 4: "What's the minimum spend to hit $5M revenue?"

```python
form = copy.deepcopy(base_form)
form["objective"] = "depvar"
form["target"] = "5000000"
form["confidence"] = "75"
form["strategy"] = None
# Remove or loosen total_spend constraint so optimizer has flexibility
form["spend_scope"] = ""
form["total_spend"] = None
```

---

## Reading a Constrained Result

Constraints define the search space; the model only ranks within it. A constrained result answers "the best plan within the constraints," not necessarily "the unconstrained maximum." Sometimes the constraints can be quite binding.

- **Check what binds.** Compare each channel's spend to its `min`/`max`. A channel at its `max` means the model wanted to spend more there and couldn't.
- **Where binding changes the reading:** under `profit`, marginal returns equalize across channels that are *not* at a bound. So a low-marginal-cost channel sitting at its `max` while an expensive channel absorbs the remaining budget is the constraint deciding, not the model. This is the usual answer to "why is it funding conversion instead of awareness?"
- **If most channels bind, the run is reporting the plan back to you.** Sum the `max` values: if that total is at or near `total_spend`, the allocation was largely determined before the optimizer ran.
- Suggest to the user that they may want to re-run with very wide bounds (an "unconstrained recommendation") and compare the diff. See https://docs.getrecast.com/docs/optimizer.md
- **Widening bounds has a limit.** Raising a `max` well above a channel's historical spend, or activating a channel with little spend history, moves the response curve into extrapolation. Expect much wider intervals and say so.

---

## Common Mistakes to Avoid

1. **Using numbers instead of strings for min/max/target/confidence/total_spend** — The form uses string types for these fields. `"300000"` not `300000`.

2. **Passing CPA directly as target for ROI objective** — CPA models express efficiency as CPA (cost per acquisition), but the `target` field always expects ROI (outcome/spend). Convert: target CPA of $50 → `"target": "0.02"` (= 1/50).

3. **Setting confidence for profit objective** — Profit objective requires `confidence: null`. Setting a confidence value will cause errors.

4. **Forgetting strategy for profit objective** — Profit requires `strategy` to be one of `"conservative"`, `"base"`, or `"aggressive"`. Other objectives require `strategy: null`.

5. **Putting lower funnel channels in channel_budgets** — Lower funnel channels (e.g., branded search) are predicted by the model. Use `lower_funnel_caps`, not `channel_budgets`.

6. **Not including all channels in channel_budgets** — Only channels that appear in a `channel_budgets` entry get optimized. Missing channels are excluded from optimization entirely.

7. **Manually splitting a grouped channel budget** — When the client gives a bound for a set of channels (e.g., "Meta between $300K and $600K"), put them in one `channel_budgets` entry with that combined min/max and let the optimizer choose the split. Don't invent 80/20 or 60/40 per-channel entries — that substitutes your guess for the thing the optimizer is for.

8. **Setting min > max on channel_budgets** — Returns a 422 validation error.

9. **Ignoring drop_days for pulsed channels** — TV, direct mail, podcasts don't spend daily. If the model was trained on pulsed patterns, set `drop_days` accordingly or the optimizer will spread spend daily, misaligning with modeled saturation curves.

10. **Not using `use_latest_deployments: true`** — Unless the client explicitly wants a specific historical deployment, always set this to `true`. Stale deployment IDs can cause failures.

11. **Double-counting multiplier and strategy in multi-KPI profit** — For multi-KPI profit optimizations, the weights in `multiplier` and the `strategy` factor multiply together. Encode the contribution margin in `multiplier` values directly.

12. **Using spike names the model doesn't know** — Spike names must match existing spike groups from the model. Invalid names are silently ignored or cause errors.

13. **Forgetting the `data` wrapper on list endpoints** — `GET /optimizations` and `GET /kpis` return `{"data": [...], "pagination": {...}}`. You must access `response["data"]` to get the array. Show endpoints (`GET /optimizations/{id}`, `GET /kpis/{id}`) return the object directly with no wrapper.

14. **Cloning an old optimization to answer a new question** — use Workflow A unless the client named a specific past run to update.

15. **Quoting one efficiency number without saying which it is** — `spend ÷ predicted KPI` is **blended** CPA/ROI: valid, and usually what a planner wants. But the predicted KPI includes baseline and spikes, which land without media, so blended is not the cost of the next acquisition. Label it "blended," and when the question is about *change* — comparing scenarios, or "what does more budget buy?" — report incremental or marginal cost alongside it, not blended alone.

---

## Code Generation Rules

**General:**
- Load the PAT from an environment variable: Python uses `os.environ["RECAST_PAT"]`, R uses `Sys.getenv("RECAST_PAT")`. Teach the user how to set their own environment variable.
- NEVER print, log, or display the token.
- Base URL: `https://api.getrecast.com`
- All endpoints are under `/v1/clients/{client_slug}/optimizations` (and `/kpis` for KPI info).
- Auth: Bearer token in the Authorization header.
- Always set `show_in_ui = False` unless the client specifically asks to see results in the UI.
- Always set `use_latest_deployments = True` unless they specifically mention wanting to use older deployments.
- Include error handling that shows the response body on non-200/201 responses.
- Poll for completion with a 30-second interval and 15-minute timeout.

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
| GET | `/v1/clients/{client_slug}/optimizations` | List optimizations (paginated: `?page=1&per_page=25`) |
| GET | `/v1/clients/{client_slug}/optimizations/{id}` | Show optimization (returns form, status, results, downloads) |
| POST | `/v1/clients/{client_slug}/optimizations` | Create optimization |
| GET | `/v1/clients/{client_slug}/optimizations/{id}/downloads/{key}` | Download CSV (set `Accept: text/csv`) |
| GET | `/v1/clients/{client_slug}/kpis` | List available KPIs |
| GET | `/v1/clients/{client_slug}/kpis/{kpi_id}` | Get KPI detail with depvar_configurations |
| GET | `/v1/clients/{client_slug}/deployments` | List deployments (narrow with `dashboard_slug`) |
| GET | `/v1/clients/{client_slug}/deployments/{id}` | Deployment detail — channel labels, `model_date`, contextual variable defaults. `extra_fields[]` (array) adds `drop_days` (recommended spend frequency per channel), `spend` (history), `default_budget` (BAU budget) |

### Create request body

```json
{
  "form": { ... },
  "name": "string",
  "show_in_ui": false,
  "use_latest_deployments": true
}
```

### Response envelope — List vs Show endpoints

**List endpoints** (GET `/optimizations`, GET `/kpis`) wrap their payload in a `data` key with `pagination`. You must access `response["data"]` (Python) or `response$data` (R) to get the array of items.

**Show endpoints** (GET `/optimizations/{id}`, GET `/kpis/{kpi_id}`) return the object **directly** — no `data` wrapper.

### List response structure

```json
{
  "data": [
    { "id": 123, "name": "string", "status": "success", "created_at": "ISO8601", "updated_at": "ISO8601" }
  ],
  "pagination": { "page": 1, "per_page": 25, "total_pages": 3, "total_count": 52 }
}
```

### Show response structure (no wrapper)

```json
{
  "id": 123,
  "name": "string",
  "status": "processing | success | canceled | error",
  "form": { ... },
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "results": [
    {
      "depvars": [{ "name": "string", "deployment_id": 123, "weight": 1.0 }],
      "goal_type": "string",
      "goal_value": "string",
      "expected_revenue": 1234.56,
      "recommended_total_spend": 1234.56,
      "expected_earned_roi": 1.23,
      "expected_paid_roi": 1.23,
      "downloads": [{ "description": "string", "key": "string" }]
    }
  ]
}
```

### KPI list response structure

```json
{
  "data": [
    { "id": "uuid", "name": "Revenue", "depvars": [{ "slug": "revenue", "weight": 1.0 }] }
  ]
}
```

### KPI show response structure (no wrapper)

```json
{
  "id": "uuid",
  "name": "Revenue",
  "depvar_configurations": [
    { "name": "revenue", "deployment_id": 456, "multiplier": 1.0, "spikes": [] }
  ]
}
```

---

## Glossary (translate client language to form fields)

| Client says | Form field |
|---|---|
| "budget", "how much to spend" | `total_spend`, `exact_spend`, or channel_budget `min`/`max` |
| "goal", "target", "what I'm trying to hit" | `target` |
| "confidence", "how sure" | `confidence` (string, 0-100) |
| "time period", "date range", "when" | `constraints[].start_date` / `end_date` |
| "channels", "media mix" | `constraints[].channel_budgets[].channels` |
| "minimum spend", "floor" | channel_budget `min` or channel `committed_spend` |
| "maximum spend", "ceiling", "cap" | channel_budget `max` |
| "model", "depvar", "KPI" | `depvar_configurations` |
| "weight", "importance" | `depvar_configurations[].multiplier` |
| "strategy", "conservative/aggressive" | `strategy` (only with profit objective) |
| "frequency", "how often to spend" | channel `drop_days` |
| "exclude from optimization" | `channel_budgets[].unoptimized: true` |
| "branded search", "lower funnel" | `lower_funnel_caps` (NOT channel_budgets) |
| "promotional event", "sale", "holiday" | `depvar_configurations[].spikes` |

## Resources

If the client asks for something not covered here:
- https://docs.getrecast.com/docs/optimizer
- https://docs.getrecast.com/docs/the-optimizer-api
