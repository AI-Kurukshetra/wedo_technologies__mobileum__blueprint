# PRD — TeleGuard Pro

## 1) Summary

**TeleGuard Pro** is a SaaS platform for telecom operators and MVNOs to detect fraud and revenue leakage using CDR analytics, configurable fraud rules, alerts, and case management.

**Primary outcome:** reduce fraud losses and improve revenue assurance via faster detection, investigation workflows, and clear analytics.

## 2) Problem Statement

Telecom fraud and revenue leakage often go unnoticed due to:

- Massive CDR volume and delayed reporting
- Fragmented tooling across network, billing, and analytics teams
- Lack of explainable detection signals and actionable workflows
- Poor collaboration across fraud ops, finance, and engineering

TeleGuard Pro centralizes ingestion, detection, alerting, investigation, and reporting in one secure, multi-tenant product.

## 3) Target Users & Personas

### 3.1 Fraud Analyst (Primary)

- Monitors suspicious activity, validates alerts, opens/updates cases
- Needs explainable alerts and efficient investigation tooling

### 3.2 Revenue Assurance (RA) Analyst (Primary)

- Focuses on leakage, reconciliation, billing mismatches, unusual trends
- Needs KPI dashboards, anomalies, and exportable reports

### 3.3 Fraud/RA Manager (Secondary)

- Oversees team workload and outcomes
- Needs SLA, case throughput, fraud loss estimates, audit trails

### 3.4 System Admin (Primary for setup)

- Configures org, users, roles, integrations, and notifications
- Needs secure access control, environments, and easy onboarding

## 4) Scope (MVP)

### 4.1 Must-Have Features

1. **Authentication & org multi-tenancy** (Supabase Auth + RLS)
2. **CDR ingestion**
   - Upload CSV (web UI)
   - Basic validation + schema mapping
   - Store raw + normalized CDR rows
3. **CDR analytics**
   - Aggregations by time window, carrier, trunk, IMSI/IMEI (if present), destination, country, customer/account
   - KPIs: call count, duration, ASR/ACD (if answer status available), charge amount, margin (if cost/revenue provided)
4. **Fraud detection rules**
   - CRUD rules with conditions + time windows
   - Rule evaluation producing alerts
   - “Explainability” payload: which condition(s) triggered, key stats
5. **Alerts system**
   - Alert list, filtering, status transitions (New → Acknowledged → Resolved/False Positive)
   - Routing/assignment
   - Notifications (email at minimum)
6. **Case management**
   - Create case from alert(s)
   - Assign owner, set severity, status workflow, add notes/evidence links
   - Activity log / audit trail
7. **Analytics dashboard**
   - Executive overview + operational drill-down
   - Time series charts and top-N tables
   - Export CSV

### 4.2 Nice-to-Have (Post-MVP)

- SFTP ingestion / API ingestion from mediation layer
- Webhooks to SIEM, Slack, PagerDuty
- ML anomaly scoring (unsupervised) + model management
- Rules simulation (“run rule on historical window”)
- User-configurable dashboards
- Automated remediation playbooks

### 4.3 Out of Scope (for MVP)

- Inline call blocking / real-time network enforcement
- Full billing system replacement
- Multi-region active-active deployment

## 5) User Stories (MVP)

### 5.1 Authentication & Org

- As an **Admin**, I can create an organization and invite users.
- As an **Admin**, I can assign roles (Admin, Manager, Analyst, Read-only).
- As a **User**, I can sign in and only see my organization’s data.

### 5.2 CDR Ingestion

- As an **Analyst**, I can upload a CSV of CDRs and track ingestion status.
- As an **Analyst**, I can see validation errors (missing required fields, invalid timestamps).
- As an **Analyst**, I can re-upload corrected files without corrupting prior data.

### 5.3 Analytics

- As an **RA Analyst**, I can view KPIs for a date range and filter by carrier/customer/destination.
- As an **RA Analyst**, I can drill down from aggregates to underlying CDR rows.
- As a **Manager**, I can export KPI tables to CSV.

### 5.4 Rules

- As an **Analyst**, I can create a fraud rule (e.g., “high international call volume in 15 minutes”).
- As an **Analyst**, I can enable/disable a rule and set severity.
- As an **Analyst**, I can test a rule on recent data (MVP: run once on last N hours).

### 5.5 Alerts

- As an **Analyst**, I can see a list of alerts with severity and trigger details.
- As an **Analyst**, I can acknowledge and assign alerts.
- As an **Analyst**, I can mark alerts as resolved or false positive with a reason.

### 5.6 Cases

- As an **Analyst**, I can create a case from one or more alerts.
- As an **Analyst**, I can add notes and attach evidence (links/files).
- As a **Manager**, I can review case outcomes and audit history.

## 6) Functional Requirements

### 6.1 Data Model Requirements

- Multi-tenant data isolation by `org_id`
- Immutable raw ingestion records
- Normalized CDR table suitable for analytics
- Rules + rule versions (to preserve history when edited)
- Alerts referencing the rule version + evidence snapshot
- Cases referencing alerts and maintaining workflow history

### 6.2 Rules Engine (MVP)

Rules are **configurable** and **explainable**:

- Conditions:
  - Thresholds (count/duration/amount)
  - Ratios (e.g., failed calls %)
  - Lists (allow/deny for country/prefix/IMSI/account)
  - Time windows (5m/15m/1h/24h)
  - Dimensions (by account, by trunk, by source CLI, by IMSI)
- Output:
  - Alert severity and title
  - Trigger stats and top contributors
  - Dedup key to prevent alert storms

### 6.3 Alerting (MVP)

- Alert lifecycle: `new` → `acknowledged` → `resolved` / `false_positive`
- Assignment to a user
- Notification policy (default: email for high/critical)

### 6.4 Case Management (MVP)

- Case lifecycle: `open` → `in_review` → `closed`
- Link multiple alerts to one case
- Notes, timeline events, attachments
- Outcome classification (fraud confirmed, leakage confirmed, benign, unknown)

### 6.5 Dashboard (MVP)

- Global KPIs (selected date range):
  - total calls, total duration, total revenue, total cost, margin
  - fraud alerts by severity, open cases, MTTA/MTTR
- Drill-down:
  - by destination country/prefix, by account, by trunk/carrier
- Recent activity:
  - newest alerts and cases

## 7) Non-Functional Requirements

### 7.1 Security & Compliance

- RLS enforcement for all tenant tables (Supabase)
- Least privilege for service role usage (server-only)
- Audit log for key actions (rule edits, alert status changes, case changes)
- PII handling:
  - Hash or tokenize sensitive identifiers where possible
  - Support redaction in UI for roles without permission

### 7.2 Performance

- Ingestion: handle at least 1M CDR rows/day/org (MVP target), with incremental imports
- Dashboard: typical queries under 2–3s for 30-day range using aggregates/materialized views

### 7.3 Reliability

- Idempotent processing (retries safe)
- Background jobs for heavy computations (cron/queue pattern)
- Backups and retention policies

### 7.4 Observability

- Structured logs for ingestion, rule evaluations, notifications
- Health checks for cron runs
- Error reporting (Sentry or equivalent)

## 8) Metrics & Success Criteria

- Fraud detection lead time reduced (baseline vs. with TeleGuard Pro)
- % of alerts investigated within SLA
- Reduction in false positives over time (rule tuning)
- Revenue leakage identified and recovered (reported value)

## 9) MVP Acceptance Criteria (Concrete)

1. A new org can be created; invited users can sign in and see only their org data.
2. CSV upload ingests CDRs, shows row counts, errors, and a completion status.
3. Dashboard shows KPI time series and top destinations for a selectable date range.
4. Creating an enabled rule generates alerts on matching data within the configured window.
5. Alerts can be acknowledged, assigned, resolved/marked false positive with reason.
6. A case can be created from an alert, assigned, updated with notes, and closed with outcome.
7. All rule edits and status changes create audit log entries.

## 10) Phased Roadmap (Suggested)

- **Phase 0 (Foundation):** auth/org/RLS, UI shell, seed data.
- **Phase 1 (CDR):** ingestion, normalization, analytics base tables, dashboard KPIs.
- **Phase 2 (Detection):** rules CRUD, evaluation jobs, alerts UI + notifications.
- **Phase 3 (Workflow):** case management, evidence, SLA metrics, audit polish.
- **Phase 4 (Integrations):** SFTP/API ingest, webhooks, SIEM export, advanced reporting.

