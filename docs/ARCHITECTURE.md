# Architecture — TeleGuard Pro

## 1) Tech Stack

- **Frontend/Backend:** Next.js (App Router) on Vercel
  - Server Components for data fetching
  - Route Handlers for API endpoints
  - Server Actions for form mutations (optional)
- **Database/Auth/Storage:** Supabase
  - Postgres + Row Level Security (RLS)
  - Supabase Auth (email/password + magic link optional)
  - Supabase Storage for uploaded CDR files and case attachments
- **Deployment:** Vercel
  - Cron Jobs for scheduled processing (Vercel Cron hitting internal endpoints)

## 2) High-Level Components

1. **Web App**
   - Dashboard, CDR explorer, rules builder, alerts, cases, admin settings
2. **API Layer**
   - Next.js Route Handlers (server-only) for:
     - file upload orchestration
     - ingestion jobs
     - rule evaluation jobs
     - notifications dispatch
3. **Data Layer (Supabase Postgres)**
   - Core tables: orgs, memberships, cdr_imports, cdr_records, aggregates, rules, alerts, cases, audit_log
   - Views/materialized views for analytics
4. **Background Processing**
   - **Ingestion pipeline:** parse + normalize CSV into `cdr_records`
   - **Aggregation:** compute hourly/daily aggregates for dashboard speed
   - **Rules engine:** evaluate enabled rules on recent windows to produce alerts
   - **Notification dispatcher:** send emails/webhooks for eligible alerts

## 3) Tenancy Model

TeleGuard Pro is multi-tenant by organization.

- Every tenant-scoped table includes `org_id`.
- RLS policies enforce:
  - users see only rows belonging to orgs they are members of
  - additional RBAC constraints by role (e.g., read-only cannot mutate)
- Server-side “service role” is used **only** for background jobs and privileged admin actions; it must never run in the browser.

## 4) Identity, Roles, and Authorization

### 4.1 Supabase Auth

- Primary method: email/password (MVP)
- Optional: magic link, SSO (post-MVP)

### 4.2 RBAC (Recommended)

Roles (per org membership):

- `admin`: manage org settings, users, integrations, all data
- `manager`: manage rules, triage alerts/cases, view analytics
- `analyst`: manage alerts/cases, create/edit rules (optional), view analytics
- `read_only`: view analytics and read-only access to alerts/cases

Enforcement:

- RLS checks membership + role for mutations
- UI gates actions (defense-in-depth)

## 5) Data Flow

### 5.1 CDR Ingestion (CSV Upload)

1. User uploads a CSV file in the UI.
2. Web app creates a `cdr_import` row with status `uploaded`.
3. File is stored in Supabase Storage (`cdr-imports` bucket) with an object path:
   - `org/{org_id}/imports/{import_id}/original.csv`
4. A server endpoint triggers ingestion:
   - reads file (server-side)
   - validates rows (required fields)
   - normalizes fields to canonical schema
   - inserts into `cdr_records` in batches
5. Import status becomes `processed` with counts (rows ok/failed).

Idempotency:

- Each import has a unique `import_id`.
- `cdr_records` includes `import_id` and a per-row `source_row_hash` to avoid duplicates when reprocessing.

### 5.2 Aggregation

To keep dashboards fast:

- Compute **hourly** aggregates from `cdr_records` into `cdr_aggregates_hourly`
- Compute **daily** aggregates into `cdr_aggregates_daily`

Scheduling:

- Vercel Cron (e.g., every 10 minutes) calls `/api/jobs/aggregate?scope=hourly`
- nightly cron calls `/api/jobs/aggregate?scope=daily`

### 5.3 Rules Evaluation → Alerts

1. Enabled rules are queried (per org).
2. For each rule, the evaluation job:
   - defines a time window (e.g., last 15 minutes)
   - runs an aggregation query grouped by a dimension (e.g., by account or source CLI)
   - applies thresholds/lists
3. For each match, create an `alert` with:
   - rule metadata snapshot (rule version)
   - evidence payload (stats, top contributors)
   - deduplication key to avoid repeated alerts for same entity/window

Scheduling:

- Vercel Cron every 5 minutes calls `/api/jobs/evaluate-rules`

### 5.4 Alert Notifications

Notification job selects alerts that:

- are newly created and not yet notified
- meet severity threshold
- match org notification policy

Dispatch:

- Email: via provider (implementation choice; keep adapter interface)
- Webhook: POST to configured URL (post-MVP)

## 6) Recommended Next.js App Structure

Example layout (suggested):

- `app/(auth)/login`
- `app/(app)/dashboard`
- `app/(app)/cdr/imports`
- `app/(app)/cdr/explorer`
- `app/(app)/rules`
- `app/(app)/alerts`
- `app/(app)/cases`
- `app/(app)/settings`
- `app/api/*` (Route Handlers)
- `lib/supabase/server.ts` (server client)
- `lib/supabase/browser.ts` (browser client)
- `lib/rbac.ts` (role checks)
- `lib/rules/*` (rule evaluation helpers)
- `lib/ingestion/*` (CSV parsing, mapping, validation)

## 7) Background Jobs on Vercel (Cron + Route Handlers)

MVP approach uses Vercel Cron to call internal endpoints.

- `GET /api/jobs/ingest?importId=...` (optional if ingestion is async)
- `POST /api/jobs/aggregate` (hourly/daily)
- `POST /api/jobs/evaluate-rules`
- `POST /api/jobs/notify`

Security:

- Protect job routes with:
  - a shared secret header (e.g., `x-job-secret`)
  - AND/OR Vercel Cron protection
- Ensure endpoints use service role key and never leak it to clients.

## 8) Storage Strategy

Buckets:

- `cdr-imports`: raw upload files
- `case-attachments`: evidence files (screenshots, exported CSVs)

Object path convention:

- `org/{org_id}/...` to simplify scoped cleanup and reduce accidental exposure

Access:

- Use private buckets + signed URLs
- Only server creates signed URLs

## 9) Security Design

- **RLS everywhere**: tables are private by default.
- **Service role only on server**: never in browser.
- **Audit logging**:
  - rule create/edit/enable/disable
  - alert status transitions
  - case lifecycle changes
  - membership changes
- **Data minimization**:
  - avoid storing unnecessary PII; hash where feasible
  - apply retention (e.g., raw CDR keep 90–365 days configurable)

## 10) Observability & Operations

Logging:

- structured logs for ingestion and jobs (`import_id`, `org_id`, counts, duration)

Metrics (MVP):

- number of processed imports/day
- alert creation rate
- rule evaluation run duration
- error counts

Tooling (implementation choice):

- Sentry for errors
- Vercel Analytics for performance

## 11) Key Design Decisions (MVP)

- Use Postgres for rules evaluation via SQL aggregates (fast, explainable, minimal infra).
- Use precomputed aggregates for dashboard responsiveness.
- Prefer idempotent jobs and immutable snapshots for evidence/auditability.

