# Coding Plan — TeleGuard Pro (AI-Agent Friendly)

This plan is a step-by-step build guide with clear milestones. It’s written so an AI coding agent can execute tasks sequentially and verify progress.

## 0) Assumptions

- Next.js (App Router) project deployed on Vercel
- Supabase project created (Postgres + Auth + Storage)
- Single region, single environment (dev) initially

## 1) Milestone 1 — Repo Scaffold & Tooling

Goals:

- base Next.js app shell
- Supabase SSR auth integration
- protected routes layout for app vs auth pages

Tasks:

1. Create Next.js app with App Router.
2. Add Supabase SSR client setup:
   - `lib/supabase/server.ts`
   - `lib/supabase/browser.ts`
   - session middleware if needed
3. Create layouts:
   - `(auth)` group: login
   - `(app)` group: sidebar layout + protected access check
4. Add basic navigation routes (empty pages) for:
   - dashboard, cdr/imports, cdr/explorer, rules, alerts, cases, settings

Definition of Done:

- user can log in via Supabase
- authenticated user sees app shell; unauthenticated redirected to `/login`

## 2) Milestone 2 — Database + RLS + Seed (Foundation)

Goals:

- schema and RLS policies in place
- seed dev data for demo org and users

Tasks:

1. Create migrations for enums/tables per `docs/DATABASE_SCHEMA.md`.
2. Enable RLS and apply policies to all tenant tables.
3. Create helper SQL functions:
   - `is_org_member(org_id uuid)`
   - `org_role(org_id uuid)`
4. Create storage buckets and access policies:
   - `cdr-imports`, `case-attachments` (private)
5. Add seed script (recommended) that:
   - creates demo users (admin API)
   - creates org + memberships + sample records

Definition of Done:

- signed-in demo users see only Acme Telco data
- read-only user cannot mutate data (verified by API returning 403)

## 3) Milestone 3 — CDR Imports & Ingestion

Goals:

- upload CSV to storage
- ingest into `cdr_imports` + `cdr_records`
- show ingestion status and errors

Tasks:

1. Build `/cdr/imports` page with imports list.
2. Implement API:
   - `POST /api/cdr/imports` (create import + signed upload URL)
   - `POST /api/cdr/imports/:importId/ingest` (parse + insert)
3. Implement CSV parsing and validation:
   - strict required fields: `call_start_at`, `duration_seconds`, `a_party`, `b_party`
   - normalize numeric and timestamps
   - compute `source_row_hash`
4. Batch insert with reasonable chunk size (e.g., 1k rows).
5. Update import counts and status.
6. Add import details screen with error table.

Definition of Done:

- uploading a CSV results in processed import with rows in `cdr_records`
- errors are visible and don’t block valid rows from importing

## 4) Milestone 4 — Analytics Aggregates + Dashboard

Goals:

- KPI endpoints backed by efficient queries/aggregates
- dashboard UI with charts and drill-down

Tasks:

1. Implement aggregate builder job:
   - hourly and daily tables from `cdr_records`
2. Create analytics endpoints:
   - `/api/analytics/kpis`
   - `/api/analytics/timeseries`
   - `/api/analytics/top`
3. Build `/dashboard` with KPI cards, time series, top tables.
4. Implement `/cdr/explorer`:
   - filterable CDR list + detail drawer
   - export CSV (server-generated)

Definition of Done:

- dashboard loads in <3 seconds for 30-day range (with aggregates)
- drill-down navigates to explorer with filters applied

## 5) Milestone 5 — Rules CRUD + Versioning

Goals:

- create/edit/enable/disable rules
- persist rule versions for auditability

Tasks:

1. Build `/rules` list and `/rules/:ruleId` builder UI per `docs/UI_SCREENS.md`.
2. Implement APIs:
   - `GET/POST /api/rules`
   - `PATCH /api/rules/:ruleId`
   - `POST /api/rules/:ruleId/enable|disable`
3. Implement rule validation:
   - dimension type allowed list
   - window bounds (e.g., 5–1440 minutes)
   - thresholds/filters schema validation
4. On update/enable:
   - insert `fraud_rule_versions` snapshot
   - record `audit_log` entry

Definition of Done:

- rule edits preserve history via versions
- rule enable/disable is immediate and audited

## 6) Milestone 6 — Rule Evaluation → Alerts

Goals:

- scheduled evaluation produces deduped, explainable alerts
- alerts UI supports triage lifecycle

Tasks:

1. Implement evaluation job endpoint:
   - `POST /api/jobs/evaluate-rules` (protected)
2. For each enabled rule:
   - compute window (`now - window_minutes`)
   - group by `dimension_type`
   - compute metrics needed by thresholds (count, duration, revenue, failed rate)
   - apply filters
3. Create alert records with:
   - `dedup_key`
   - evidence payload (stats + top contributors)
   - `rule_version_id`
4. Build `/alerts` list and `/alerts/:alertId` detail.
5. Implement alert actions APIs:
   - acknowledge, assign, resolve/false positive
6. Add `audit_log` entries for all transitions.

Definition of Done:

- running job creates alerts from demo attack traffic
- alerts can be triaged and changes show in UI with audit log

## 7) Milestone 7 — Case Management

Goals:

- create case from alert(s)
- manage status, notes, attachments

Tasks:

1. Implement `/cases` list and `/cases/:caseId` detail.
2. APIs:
   - `GET/POST /api/cases`
   - `PATCH /api/cases/:caseId`
   - `POST /api/cases/:caseId/events`
   - `POST /api/attachments` (signed upload)
3. Case ↔ alert linking via `case_alerts`.
4. Attachments stored in `case-attachments` bucket with signed URLs.
5. Audit log for critical updates.

Definition of Done:

- create case from an alert, add notes, upload an attachment, close with outcome

## 8) Milestone 8 — Notifications (Email MVP)

Goals:

- send email on new high/critical alerts
- configurable per org

Tasks:

1. Settings UI for notification policy.
2. Job endpoint:
   - `POST /api/jobs/notify` (protected)
3. Add notification adapter interface:
   - `sendEmail(to[], subject, html/text)`
4. Update alerts with `notified_at`.

Definition of Done:

- high alerts trigger email to configured recipients
- job is idempotent (does not resend after `notified_at` set)

## 9) Final Hardening Checklist

- [ ] Verify all RLS policies (attempt cross-org access in tests or manual scripts)
- [ ] Add input validation for all endpoints
- [ ] Rate-limit sensitive endpoints (login, upload, exports) as needed
- [ ] Add monitoring (error reporting + job logs)
- [ ] Document env vars and runbooks (`docs/DEPLOYMENT.md`)

