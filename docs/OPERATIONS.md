# TeleGuard Pro — Operations

## Environment variables

Required (Next.js):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required (server-side jobs + admin operations):

- `SUPABASE_SERVICE_ROLE_KEY`

## Migrations

Migrations are stored in `supabase/migrations/`.

Apply to remote:

```bash
npx supabase db push
```

Notable migrations added by this implementation:

- Analytics RPCs: `supabase/migrations/20260315030000_analytics_rpc.sql`
- Storage buckets: `supabase/migrations/20260315030500_storage_buckets.sql`
- System metrics: `supabase/migrations/20260315032000_system_metrics.sql`
- Enterprise RA extensions: `supabase/migrations/20260315033000_enterprise_ra_extensions.sql`

## Jobs (cron)

Jobs run as a separate Node process (recommended for Vercel + Supabase):

```bash
npm run jobs
```

Scheduling (`jobs/scheduler.ts`):

- `cdrAggregationJob`: every 5 minutes
- `ruleEvaluationJob`: every 2 minutes
- `alertEscalationJob`: every 10 minutes
- `metricsRefreshJob`: every 5 minutes
- `scheduledReportsJob`: every 15 minutes

Jobs require `SUPABASE_SERVICE_ROLE_KEY` so they can operate across orgs and bypass RLS safely.

## Manual job execution

API:

- `POST /api/admin/jobs/run`

Example payload:

```json
{ "job": "ruleEvaluationJob", "scope": "active_org" }
```

Available jobs:

- `cdrAggregationJob`
- `ruleEvaluationJob`
- `alertEscalationJob`
- `metricsRefreshJob`
- `scheduledReportsJob`

Authorization:

- `scope=active_org`: admin or manager
- `scope=all`: admin only

## System health

Admin page:

- `/admin/system-health`

Data:

- `system_metrics` (updated by jobs)
- Core keys: `processing_latency`, `cdr_ingestion_rate`, `alerts_generated`, `rules_evaluated`

## Reports

Reports page:

- `/reports`

Generation:

- `POST /api/reports/generate` generates CSV and uploads to Storage bucket `reports`
- Supported types include `regulatory_summary`, `compliance_audit`, and `revenue_recovery`
- Report scheduling:
  - `POST /api/reports/[id]/schedule`
  - persisted in `reports.schedule_cron` and executed by `scheduledReportsJob`

Download:

- `GET /api/reports/[id]/download` returns a signed URL

## Reconciliation

API:

- `POST /api/reconciliation/run`
- `GET /api/reconciliation`
- `GET /api/reconciliation/[id]`

UI:

- `/reconciliation`

## Data Quality

API:

- `POST /api/data-quality/run`
- `GET /api/data-quality`
- `GET /api/data-quality/[id]`

UI:

- `/data-quality`

## Billing connectors (abstraction)

API:

- `GET /api/billing-connectors`
- `POST /api/billing-connectors`
- `PATCH /api/billing-connectors/[id]`
- `DELETE /api/billing-connectors/[id]`
- `POST /api/billing-connectors/[id]/test`

UI:

- `/settings/billing-connectors`

Implemented connector types:

- `mock_rest`
- `mock_csv`

## Revenue recovery tracking

API:

- `POST /api/revenue-recovery`
- `GET /api/revenue-recovery`
- `GET /api/analytics/revenue-recovery`

Use cases:

- Record recovered revenue from case closure or alert resolution
- Include recovery in KPI/reporting flows

## Optional fast evaluation on ingest

`POST /api/cdr/ingest-stream` supports header:

- `x-auto-evaluate: true`

When enabled, the service triggers rule evaluation after insert for lower detection latency.

## Storage buckets

Buckets used:

- `case-attachments` (case file uploads)
- `reports` (generated CSV reports)

If buckets are missing, apply migrations and/or create them in Supabase Storage UI.

