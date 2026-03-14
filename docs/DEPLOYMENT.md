# Deployment — TeleGuard Pro (Supabase + Vercel)

This document covers environment setup, secrets, migrations, cron jobs, and operational runbooks.

## 1) Environments

Recommended:

- `dev` (local + preview)
- `prod` (Vercel production + Supabase production project)

Keep Supabase projects separate per environment.

## 2) Supabase Setup

### 2.1 Create Project

In Supabase:

- create a new project (region near primary users)
- note:
  - Project URL
  - Anon key
  - Service role key (server-only)

### 2.2 Auth Configuration

MVP:

- enable email/password
- set site URL(s) for redirect:
  - local: `http://localhost:3000`
  - prod: `https://<your-domain>`

Optional:

- magic link
- password reset templates

### 2.3 Storage Buckets

Create private buckets:

- `cdr-imports`
- `case-attachments`

Policies:

- deny public access
- use signed URLs for read/write
- object paths include `org/{org_id}/...`

### 2.4 Database Migrations

Apply schema from `docs/DATABASE_SCHEMA.md` via Supabase migrations.

Minimum objects:

- enums
- tables + indexes
- helper SQL functions for membership and role checks
- RLS enablement + policies

### 2.5 Seed Data (Dev Only)

Run seed script in dev to create:

- demo org and users
- sample CDR data
- starter rules/alerts/case

Avoid seeding in prod unless explicitly requested.

## 3) Vercel Setup

### 3.1 Project

- import the Git repo into Vercel
- set framework preset to Next.js

### 3.2 Environment Variables

Set these in Vercel Environment Variables.

Required (public):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required (server-only):

- `SUPABASE_SERVICE_ROLE_KEY`
- `JOB_SECRET` (used to protect `/api/jobs/*`)

Optional:

- `APP_BASE_URL` (for generating links in emails)
- `EMAIL_PROVIDER_API_KEY` (if using an email provider)
- `SENTRY_DSN` / `SENTRY_AUTH_TOKEN`

### 3.3 Build Settings

Typical:

- build command: `npm run build`
- output: Next.js default

## 4) Cron Jobs (Vercel Cron)

Add cron schedules (examples):

- Every 5 minutes: `POST https://<domain>/api/jobs/evaluate-rules`
- Every 10 minutes: `POST https://<domain>/api/jobs/aggregate` (hourly range)
- Every 5 minutes: `POST https://<domain>/api/jobs/notify`
- Nightly: `POST https://<domain>/api/jobs/aggregate` with `scope=daily`

Security:

- configure cron to include `x-job-secret: <JOB_SECRET>`
- reject requests missing/invalid secret with 401/403

## 5) Local Development

Two options:

1) Use hosted Supabase dev project
2) Use Supabase CLI locally (optional)

Minimum local env vars (`.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `JOB_SECRET=...`

## 6) Operational Runbooks

### 6.1 Ingestion Failures

Symptoms:

- imports stuck in `processing`
- `row_count_failed` high

Actions:

- inspect server logs for import id
- verify CSV mapping template
- re-run ingest endpoint for the import (idempotent with row hash)
- if corrupted file: delete storage object + mark import failed

### 6.2 Alert Storm / Dedup Issues

Symptoms:

- repeated alerts for same entity/window

Actions:

- validate `dedup_key` construction
- ensure unique constraint on (`org_id`, `dedup_key`, `window_start_at`)
- increase `dedup_minutes` or adjust evaluation cadence

### 6.3 Slow Dashboard Queries

Actions:

- ensure aggregates are populated (hourly/daily tables)
- add missing indexes on `cdr_records` filters
- consider materialized views for top queries

### 6.4 Security Incident Response (Basics)

- rotate Supabase service role key
- rotate `JOB_SECRET`
- review audit log for suspicious actions
- disable affected user memberships

## 7) Backup & Retention (Recommended Defaults)

- Database backups: enable Supabase PITR/backups as available on plan
- Retention policy (configurable per org later):
  - `cdr_records`: keep 180–365 days
  - `cdr_imports`: keep indefinitely (metadata only)
  - storage files: keep 30–90 days unless needed for audits

## 8) Release Checklist (Prod)

- [ ] Verify RLS policies and role restrictions
- [ ] Verify job endpoints protected and not publicly callable
- [ ] Verify private storage and signed URL behavior
- [ ] Verify notification sending and unsubscribe/recipient management (if applicable)
- [ ] Smoke test: upload CDR → aggregate → run rules → alert → create case

