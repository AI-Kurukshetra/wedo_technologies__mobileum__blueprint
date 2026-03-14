# TeleGuard Pro — Data Pipeline

This document describes how CDR data enters the platform and flows into analytics, alerts, and cases.

## Ingestion paths

### 1) CSV import (UI-driven)

UI:

- `app/(app)/cdr/imports/page.tsx`

API flow:

1. `POST /api/cdr/imports/start` → creates `cdr_imports` row (source `csv_upload`)
2. `POST /api/cdr/imports/append` → batch inserts into `cdr_records` (500 rows per batch in UI; server max 1000)
3. `POST /api/cdr/imports/finish` → marks import `processed`

Notes:

- All rows land in `cdr_records` with a required `import_id`.
- `source_row_hash` is stored for dedupe within an import via unique constraint `(import_id, source_row_hash)`.

### 2) Stream ingest (API-driven)

API:

- `POST /api/cdr/ingest-stream`

Input:

- JSON array `{ call_start_at, duration_seconds, a_party, b_party, ... }`
- or NDJSON (one JSON object per line)

Behavior:

- Creates (or reuses) a “stream import” in `cdr_imports` with `source='ingest_stream'`.
- Normalizes and validates rows, batches inserts (1000 rows per batch).
- Computes a stable `source_row_hash` to support retry-friendly writes (duplicates are ignored via upsert).

## Aggregation

Aggregations are written to:

- `cdr_aggregates_hourly`
- `cdr_aggregates_daily`

Job:

- `cdrAggregationJob` (`jobs/cdrAggregationJob.ts`) runs every 5 minutes.

Implementation:

- `lib/cdr/aggregation.ts` pulls recent CDRs and upserts aggregate rows.

## Detection & alerting

Rules are stored in:

- `fraud_rules` + `fraud_rule_versions`

Rule evaluation:

- Manual: `POST /api/rules/evaluate` or Alerts page “Run evaluation”
- Background: `ruleEvaluationJob` runs every 2 minutes

Alerts:

- Stored in `alerts` and deduped by `(org_id, dedup_key, window_start_at)`.

Escalation:

- `alertEscalationJob` runs every 10 minutes (notification policies).

## Dashboard & analytics

Dashboard reads are performed via:

- Postgres RPCs (active-org scoped): `dashboard_*` functions
- Same-origin API routes under `app/api/dashboard/*` (proxy to RPCs)

Analytics pages read via:

- Postgres RPCs in `supabase/migrations/20260315030000_analytics_rpc.sql`
- Same-origin API routes under `app/api/analytics/*`

