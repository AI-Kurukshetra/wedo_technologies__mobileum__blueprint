# TeleGuard Pro — Full flow with examples

This document explains how data moves through the app from CDR ingestion to analytics and reconciliation, with concrete examples.

---

## 1. High-level flow

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  CDR Imports    │────▶│  CDR Records │────▶│  Rules      │────▶│  Alerts      │────▶│  Cases          │
│  (upload/API)   │     │  (raw calls) │     │  (evaluate) │     │  (fraud etc) │     │  (investigate)  │
└─────────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └─────────────────┘
        │                        │                    │                    │                    │
        │                        │                    │                    │                    │
        ▼                        ▼                    ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Analytics (Revenue leakage, Roaming, Interconnect, Fraud patterns) · Reconciliation · Dashboard   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Organization and login

- You belong to an **organization** (e.g. **Meridian Telecom**, **Pinnacle Communications**).
- You pick the **active org** in the top bar; all data (CDRs, rules, alerts, cases) is **scoped to that org**.
- **Example:** James Wilson logs in, selects “Meridian Telecom”. Everything he sees is Meridian’s data only.

---

## 3. CDR flow (Call Detail Records)

### What are CDRs?

CDRs are records of calls (or data sessions): who called, when, how long, destination, revenue, cost, carrier, etc.

### 3.1 Importing CDRs

**Path:** **CDR → Imports**

- You upload a **CSV** (or use an API) with columns such as:
  - `call_start_at`, `duration_seconds`, `a_party`, `b_party`, `destination_country`, `account_id`, `carrier_id`, `revenue_amount`, `cost_amount`
- The app parses the file, deduplicates by hash, and inserts rows into **`cdr_records`** linked to an **import** (e.g. `meridian_cdr_export_2026-03-10.csv`).

**Example:**

| call_start_at       | duration_seconds | a_party   | b_party    | destination_country | account_id | carrier_id          | revenue_amount | cost_amount |
|--------------------|------------------|-----------|------------|---------------------|------------|---------------------|----------------|-------------|
| 2026-03-12 14:22:00 | 45               | +14155551234 | +442071234567 | GB                  | MRD-10042  | GlobalConnect       | 0.12           | 0.08        |

- After upload you see the import in **CDR → Imports** (filename, status, total/OK/failed rows).

### 3.2 Viewing CDRs

**Path:** **CDR → Explorer**

- You filter and search **`cdr_records`** by date range, account, country, etc.
- All numbers (revenue, cost, duration) come from these records.

---

## 4. Rules and alerts flow

### 4.1 Fraud rules

**Path:** **Rules**

- **Rules** define when to raise an **alert** (e.g. “too many calls in 15 minutes”, “revenue spike”, “high failed-call rate”).
- Each rule has:
  - **Name** (e.g. “High international volume”)
  - **Severity** (low / medium / high / critical)
  - **Window** (e.g. 15 minutes)
  - **Dimension** (e.g. by `account_id`, `carrier_id`, `destination_country`)
  - **Conditions** (e.g. `call_count >= 200`, `total_revenue >= 5000`)

**Example rule:**  
“High international volume” — severity **high**, window **15 min**, dimension **account_id**, condition **call_count ≥ 200**.  
Meaning: if a single account has 200+ calls in 15 minutes, create an alert.

### 4.2 Rule evaluation (how alerts are created)

- **Rule evaluation** runs:
  - After a **CDR import** (so new data is checked), and/or
  - On a **schedule** (e.g. every 2 minutes via **Admin → Jobs**), and/or
  - Manually via **Alerts** page → **“Run evaluation”**.
- The engine:
  1. Loads **enabled** rules for the org.
  2. Aggregates **CDR** data in time windows (e.g. by day/hour and by dimension).
  3. Checks each rule’s conditions.
  4. If a condition is met, it **inserts an alert** (with dedup so the same “event” doesn’t create duplicates).

**Example:**  
For the “High international volume” rule, the engine finds account **MRD-10042** had 250 calls in a 15‑minute window → it creates one **alert**: “High international volume — MRD-10042”, severity high, with evidence (e.g. call count, revenue).

### 4.3 Alerts

**Path:** **Alerts**

- **Alerts** are the rows created by rule evaluation when a rule’s condition is met.
- Each alert has: **title**, **severity**, **status** (new / acknowledged / resolved), **time window**, **dimension** (e.g. account_id = MRD-10042), **evidence** (e.g. stats).
- You can **acknowledge** or **resolve** alerts and (optionally) **assign** them.

**Example:**  
Alert “Revenue spike — NG”, severity **critical**, window 10:00–11:00, dimension **destination_country = NG**, evidence `{ totalRevenue: 5200, callCount: 310 }`.

---

## 5. Cases flow (investigation)

**Path:** **Cases**

- **Cases** are investigations that **group one or more alerts** and add notes, status, outcome.
- You **create a case** (e.g. “Suspected SIM box fraud — MRD-10087”), then **link alerts** to it and add **timeline events** (notes, status changes).

**Example:**

1. You see alert “High international volume — MRD-10087”.
2. You create case **“Suspected SIM box fraud — MRD-10087”**, status **Open**.
3. You link that alert (and maybe 2 more) to the case.
4. You add a note: “Pulling CDR records for the affected time window.”
5. Later you add: “Revenue impact ~$1,850. Recommending temporary account suspension.”
6. You set outcome to **confirmed_fraud** and close the case.

All of this is visible on **Cases** and on the case detail page (**Cases → [case title]**).

---

## 6. Analytics flow (read-only from same data)

Analytics **do not create** data; they **aggregate** existing CDRs, alerts, and settlements for the **active org** and **date range** (top bar).

### 6.1 Revenue leakage

**Path:** **Analytics → Revenue leakage**

- **Source:** `cdr_records` (revenue_amount, cost_amount).
- **Logic:** For each **day** in the range, sum revenue and cost; **leakage** = max(0, cost − revenue) (negative margin).
- **Example:** Mar 10: revenue $420, cost $480 → leakage **$60**. The card “Leakage” and the “Leakage trend” chart show these amounts.

### 6.2 Roaming

**Path:** **Analytics → Roaming**

- **Source:** `cdr_records` where **destination_country ≠ US**.
- **Logic:** Daily international call count and revenue; top destinations by revenue.
- **Example:** Mar 11: 340 calls to GB, DE, NG, …; top country **GB** with $85 revenue.

### 6.3 Interconnect

**Path:** **Analytics → Interconnect**

- **Source:** **Partners** and **Settlements** (amount_due, amount_paid per partner/period).
- **Logic:** Partner-level and period-level variance (due − paid).
- **Example:** Partner “GlobalConnect Ltd”: due $2,100, paid $1,800 → variance **$300** (shown in table and charts).

### 6.4 Fraud patterns

**Path:** **Analytics → Fraud patterns**

- **Source:** **Alerts** (created in the rules → alerts flow).
- **Logic:** Alerts by severity, top dimensions (account_id, carrier_id, destination_country), daily trend.
- **Example:** 12 high, 8 medium, 5 critical; top dimension **account_id = MRD-10042** with 7 alerts.

---

## 7. Reconciliation flow (compare two sources)

**Path:** **Analytics → Reconciliation** (or **Reconciliation** in nav)

- **Purpose:** Compare **two telecom data sources** over the **same date range** and list **mismatches** (e.g. CDR revenue vs partner settlements).

**Steps:**

1. Set **date range** in the top bar (e.g. Mar 7–14).
2. Click **“Run reconciliation”**.
3. In the dialog choose:
   - **Source A** (e.g. `cdr_revenue`) — daily revenue from CDRs.
   - **Source B** (e.g. `settlements_due`) — amount due from settlements (by period_start).
   - **Tolerance** (e.g. 0 or 0.01) — ignore differences smaller than this.
4. Click **“Run now”**.

**What happens:**

- The app fetches **Source A** (e.g. daily CDR revenue) and **Source B** (e.g. settlements due per period).
- It **matches by key** (e.g. date). For each key it compares the numeric value.
- If |value_A − value_B| > tolerance, it records a **mismatch** (key, value A, value B, delta).
- It saves a **reconciliation run** (name “cdr_revenue vs settlements_due”, status matched/mismatch_found, metrics) and the list of **mismatches**.

**Example:**

- Source A = `cdr_revenue`, Source B = `settlements_due`, range Mar 7–14.
- For **2026-03-10**: CDR revenue = $1,200, settlements due = $1,350 → delta **−150** → **mismatch**.
- You open the run and see a table: Key 2026-03-10, Source A 1200, Source B 1350, Delta −150. So you know that day’s billing/settlement doesn’t match CDR revenue and you can investigate.

---

## 8. Data quality and reports

- **Data quality** (**Data quality**): Run checks on your data (e.g. completeness, duplicates); results are stored and shown as “runs” with pass/fail counts.
- **Reports** (**Reports**): Generate predefined reports (e.g. “Fraud detection”) from the same analytics (e.g. fraud patterns) for a chosen period; you get a summary you can export or share.

---

## 9. End-to-end example (single story)

1. **Meridian Telecom** uploads **meridian_cdr_export_2026-03-12.csv** (**CDR → Imports**).  
   → 2,000 new rows in **cdr_records**.

2. **Rule evaluation** runs (after import or on schedule).  
   → Rule “High international volume” fires for account **MRD-10042** (220 calls in 15 min).  
   → One **alert** is created: “High international volume — MRD-10042”.

3. Analyst **David Chen** opens **Alerts**, sees the new alert, and clicks it.  
   → He creates a **case** “Unusual international traffic spike on account MRD-10042”, links this alert, and adds a note: “Pulling CDR records for the affected time window.”

4. He checks **CDR → Explorer** for MRD-10042 on that day, then **Analytics → Roaming** to see international breakdown.  
   → He adds another case note: “Confirmed traffic to NG, GH. Escalating.”

5. He goes to **Analytics → Revenue leakage** for the same range.  
   → Sees leakage $320 on Mar 12; uses that as context in the case.

6. Billing runs **Reconciliation**: Source A = **cdr_revenue**, Source B = **settlements_due**, range Mar 7–14.  
   → One run saved; they see mismatches for two days and follow up with the partner.

7. **Dashboard** shows KPIs, call volume, revenue trend, alerts by severity, top destinations, recent alerts, and recent cases — all from the same CDRs, rules, alerts, and cases above.

---

## 10. Where things live (summary)

| What you see in the UI        | Main data (tables / source)        |
|-----------------------------|-------------------------------------|
| CDR Imports                 | `cdr_imports`                      |
| CDR Explorer                | `cdr_records`                      |
| Rules                       | `fraud_rules`, `fraud_rule_versions` |
| Alerts                      | `alerts` (from rule evaluation)    |
| Cases                       | `cases`, `case_alerts`, `case_events` |
| Revenue leakage             | `cdr_records` (revenue/cost by day) |
| Roaming                     | `cdr_records` (non-US by day)      |
| Interconnect                | `partners`, `settlements`          |
| Fraud patterns              | `alerts`                           |
| Reconciliation runs         | `reconciliations`, `reconciliation_results` |
| Dashboard                   | Mix of CDRs, alerts, cases (RPCs)  |

All of this is **per organization** and **per date range** where applicable; the flow is the same for every org (e.g. Meridian vs Pinnacle), with data strictly separated by `org_id`.
