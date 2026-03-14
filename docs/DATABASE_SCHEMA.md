# Database Schema — TeleGuard Pro (Supabase Postgres)

This schema is designed for:

- **Multi-tenant org isolation** (`org_id` everywhere)
- **Explainable detection** (rule versions + evidence snapshots)
- **Fast analytics** (hourly/daily aggregates)
- **Operational workflows** (alerts + cases + audit log)

Implementation notes:

- Use Supabase migrations to create tables, enums, indexes, and RLS policies.
- All tables are `RLS enabled` and default-deny.
- Prefer UUID primary keys.

## 1) Extensions

Recommended:

- `pgcrypto` for `gen_random_uuid()`
- `citext` for case-insensitive email (optional)

## 2) Enums

Create enums in a migration:

- `role_type`: `admin`, `manager`, `analyst`, `read_only`
- `import_status`: `uploaded`, `processing`, `processed`, `failed`
- `rule_status`: `draft`, `enabled`, `disabled`
- `alert_status`: `new`, `acknowledged`, `resolved`, `false_positive`
- `case_status`: `open`, `in_review`, `closed`
- `severity`: `low`, `medium`, `high`, `critical`

## 3) Core Tables

### 3.1 Organizations

`orgs`

- `id uuid pk default gen_random_uuid()`
- `name text not null`
- `slug text unique not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- unique index on `slug`

### 3.2 Memberships (RBAC)

`org_memberships`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `user_id uuid not null` (references `auth.users(id)` logically)
- `role role_type not null default 'analyst'`
- `created_at timestamptz not null default now()`

Constraints:

- unique (`org_id`, `user_id`)

### 3.3 Audit Log

`audit_log`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `actor_user_id uuid` (nullable for system jobs)
- `action text not null` (e.g., `rule.updated`, `alert.acknowledged`)
- `entity_type text not null` (e.g., `rule`, `alert`, `case`)
- `entity_id uuid`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Indexes:

- (`org_id`, `created_at desc`)
- (`org_id`, `entity_type`, `entity_id`)

## 4) CDR Ingestion & Records

### 4.1 CDR Import Jobs

`cdr_imports`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `uploaded_by_user_id uuid`
- `status import_status not null default 'uploaded'`
- `source text not null default 'csv_upload'` (future: `sftp`, `api`)
- `original_filename text`
- `storage_object_path text not null` (Supabase storage path)
- `started_at timestamptz`
- `finished_at timestamptz`
- `row_count_total int not null default 0`
- `row_count_ok int not null default 0`
- `row_count_failed int not null default 0`
- `error_summary text`
- `created_at timestamptz not null default now()`

Indexes:

- (`org_id`, `created_at desc`)
- (`org_id`, `status`)

### 4.2 Raw/Normalized CDR Records

`cdr_records`

Minimum canonical fields (expand as needed):

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `import_id uuid not null references cdr_imports(id) on delete cascade`
- `source_row_number int` (row in CSV for error mapping)
- `source_row_hash text not null` (dedupe within import, e.g., sha256 of raw row)
- `call_start_at timestamptz not null`
- `call_end_at timestamptz` (nullable if not provided)
- `duration_seconds int not null default 0`
- `direction text` (e.g., `outbound`, `inbound`)
- `answer_status text` (e.g., `answered`, `no_answer`, `failed`)
- `a_party text` (originating CLI)
- `b_party text` (destination)
- `destination_prefix text` (e.g., E.164 prefix bucket)
- `destination_country text`
- `account_id text` (customer/account identifier)
- `carrier_id text` (upstream carrier/trunk identifier)
- `imsi text`
- `imei text`
- `revenue_amount numeric(18,6)` (nullable)
- `cost_amount numeric(18,6)` (nullable)
- `currency text` (nullable)
- `raw jsonb not null default '{}'::jsonb` (original row fields)
- `created_at timestamptz not null default now()`

Constraints:

- unique (`import_id`, `source_row_hash`)

Indexes (important):

- (`org_id`, `call_start_at desc`)
- (`org_id`, `account_id`, `call_start_at desc`)
- (`org_id`, `carrier_id`, `call_start_at desc`)
- (`org_id`, `destination_country`, `call_start_at desc`)
- GIN index on `raw` if needed (optional; use sparingly)

## 5) Aggregates (Analytics)

### 5.1 Hourly Aggregates

`cdr_aggregates_hourly`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `bucket_start_at timestamptz not null` (hour start)
- `dimension_type text not null` (e.g., `destination_country`, `account_id`, `carrier_id`)
- `dimension_value text not null`
- `call_count int not null`
- `total_duration_seconds bigint not null`
- `total_revenue numeric(18,6) not null default 0`
- `total_cost numeric(18,6) not null default 0`
- `answered_count int not null default 0`
- `failed_count int not null default 0`
- `created_at timestamptz not null default now()`

Constraints:

- unique (`org_id`, `bucket_start_at`, `dimension_type`, `dimension_value`)

Indexes:

- (`org_id`, `bucket_start_at desc`)
- (`org_id`, `dimension_type`, `bucket_start_at desc`)

### 5.2 Daily Aggregates

`cdr_aggregates_daily` has same shape but `bucket_start_at` normalized to midnight UTC (or org timezone if required later).

## 6) Rules & Rule Versions

### 6.1 Rules (Mutable Head)

`fraud_rules`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `name text not null`
- `description text`
- `status rule_status not null default 'draft'`
- `severity severity not null default 'medium'`
- `window_minutes int not null default 15`
- `dimension_type text not null` (what to group by, e.g., `account_id`, `a_party`, `destination_country`)
- `conditions jsonb not null` (see below)
- `dedup_minutes int not null default 60`
- `created_by_user_id uuid`
- `updated_by_user_id uuid`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`conditions` JSON schema (MVP suggestion):

- `thresholds`: array of `{ metric, op, value }`
  - metric: `call_count`, `total_duration_seconds`, `total_revenue`, `failed_rate`
  - op: `>`, `>=`, `<`, `<=`
- `filters`: array of `{ field, op, value }`
  - field: `destination_country`, `destination_prefix`, `carrier_id`, `account_id`
  - op: `in`, `not_in`, `eq`, `neq`, `starts_with`
- `min_sample_size`: number (optional)

Indexes:

- (`org_id`, `status`)

### 6.2 Rule Versions (Immutable Snapshot)

`fraud_rule_versions`

## 10) Telecom Domain Models (Phase 2)

These tables support operator-grade revenue assurance & fraud analytics workflows (subscriber context, partner agreements, reconciliation, and reporting).

All tables:

- include `org_id uuid not null references orgs(id) on delete cascade`
- have `created_at` / `updated_at`
- are `RLS enabled` with the same membership-role pattern as core tables

### 10.1 Subscribers

`subscribers`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `msisdn text not null` (E.164-ish; indexed; unique per org)
- `imsi text` (nullable)
- `imei text` (nullable)
- `status text not null default 'active'`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`msisdn`)
- (`org_id`)
- (`created_at desc`)

### 10.2 Networks

`networks`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `name text not null`
- `mcc text` (nullable)
- `mnc text` (nullable)
- `country_code text` (nullable)
- `network_code text` (nullable)
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.3 Services

`services`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `name text not null`
- `service_type text not null default 'voice'`
- `description text` (nullable)
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.4 Tariffs

`tariffs`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `name text not null`
- `currency text not null default 'USD'`
- `effective_from timestamptz` (nullable)
- `effective_to timestamptz` (nullable)
- `rates jsonb not null default '{}'::jsonb` (pricing/config payload)
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.5 Partners

`partners`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `name text not null`
- `partner_type text not null default 'carrier'` (e.g., `carrier`, `vendor`, `roaming_partner`)
- `country_code text` (nullable)
- `contact_email text` (nullable)
- `contact_phone text` (nullable)
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.6 Agreements

`agreements`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `partner_id uuid not null references partners(id) on delete cascade`
- `name text not null`
- `agreement_type text not null default 'interconnect'`
- `start_date date` (nullable)
- `end_date date` (nullable)
- `terms jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.7 Settlements

`settlements`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `partner_id uuid references partners(id) on delete set null`
- `agreement_id uuid references agreements(id) on delete set null`
- `period_start date not null`
- `period_end date not null`
- `currency text not null default 'USD'`
- `amount_due numeric(18,6) not null default 0`
- `amount_paid numeric(18,6) not null default 0`
- `status text not null default 'pending'`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.8 Reconciliations

`reconciliations`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `name text not null`
- `source_a text not null`
- `source_b text not null`
- `period_start date` (nullable)
- `period_end date` (nullable)
- `status text not null default 'draft'`
- `metrics jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

### 10.9 Reports

`reports`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id)`
- `name text not null`
- `report_type text not null default 'analytics'`
- `schedule_cron text` (nullable)
- `last_run_at timestamptz` (nullable)
- `config jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`)
- (`created_at desc`)

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `rule_id uuid not null references fraud_rules(id) on delete cascade`
- `version int not null`
- `snapshot jsonb not null` (full rule config at time of version)
- `created_by_user_id uuid`
- `created_at timestamptz not null default now()`

Constraints:

- unique (`rule_id`, `version`)

Workflow:

- Each time `fraud_rules` is enabled or updated, insert a new version and reference it for alerts.

## 7) Alerts

`alerts`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `rule_id uuid not null references fraud_rules(id)`
- `rule_version_id uuid not null references fraud_rule_versions(id)`
- `status alert_status not null default 'new'`
- `severity severity not null`
- `title text not null`
- `dedup_key text not null` (e.g., hash of rule_id + dimension + window bucket)
- `window_start_at timestamptz not null`
- `window_end_at timestamptz not null`
- `dimension_type text not null`
- `dimension_value text not null`
- `evidence jsonb not null default '{}'::jsonb` (stats, top contributors, sample CDR ids if needed)
- `assigned_to_user_id uuid`
- `acknowledged_at timestamptz`
- `resolved_at timestamptz`
- `resolution_type text` (e.g., `resolved`, `false_positive`)
- `resolution_reason text`
- `notified_at timestamptz`
- `created_at timestamptz not null default now()`

Constraints:

- unique (`org_id`, `dedup_key`, `window_start_at`) (prevents alert storms)

Indexes:

- (`org_id`, `created_at desc`)
- (`org_id`, `status`, `created_at desc`)
- (`org_id`, `assigned_to_user_id`, `status`)

## 8) Cases

### 8.1 Case Records

`cases`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `title text not null`
- `description text`
- `status case_status not null default 'open'`
- `severity severity not null default 'medium'`
- `owner_user_id uuid`
- `created_by_user_id uuid`
- `closed_at timestamptz`
- `outcome text` (e.g., `fraud_confirmed`, `leakage_confirmed`, `benign`, `unknown`)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- (`org_id`, `status`, `updated_at desc`)
- (`org_id`, `owner_user_id`, `status`)

### 8.2 Case ↔ Alerts Join

`case_alerts`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `case_id uuid not null references cases(id) on delete cascade`
- `alert_id uuid not null references alerts(id) on delete cascade`
- `created_at timestamptz not null default now()`

Constraints:

- unique (`case_id`, `alert_id`)

### 8.3 Case Notes / Timeline

`case_events`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `case_id uuid not null references cases(id) on delete cascade`
- `actor_user_id uuid`
- `event_type text not null` (e.g., `note`, `status_change`, `attachment_added`)
- `message text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Indexes:

- (`org_id`, `case_id`, `created_at asc`)

### 8.4 Attachments

`attachments`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `case_id uuid references cases(id) on delete cascade`
- `alert_id uuid references alerts(id) on delete cascade`
- `uploaded_by_user_id uuid`
- `storage_object_path text not null`
- `filename text not null`
- `content_type text`
- `bytes bigint`
- `created_at timestamptz not null default now()`

## 9) Notification Policies (MVP minimal)

`notification_policies`

- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null references orgs(id) on delete cascade`
- `enabled boolean not null default true`
- `min_severity severity not null default 'high'`
- `email_recipients text[] not null default '{}'::text[]`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 11) RLS Policies (Design)

### 11.1 Helper: “Is member of org”

Recommended approach:

- Create a SQL function `is_org_member(org_id uuid)` that checks `org_memberships` for `auth.uid()`.

Then use it in policies.

### 11.2 Baseline Policies (Pattern)

For each table with `org_id`:

- **SELECT:** allow if `is_org_member(org_id)`
- **INSERT:** allow if member and role is not `read_only`
- **UPDATE/DELETE:** allow if role permits (e.g., only `admin/manager/analyst`)

Role check:

- Create function `org_role(org_id uuid)` returning role for current user.

### 11.3 Service Role Bypass

Supabase service role bypasses RLS. Use it only from server-side job endpoints.

## 12) Materialized Views (Optional)

If dashboard performance needs it:

- `mv_kpis_daily_by_org`
- `mv_top_destinations_daily`

Refresh:

- cron-triggered refresh; ensure it’s per org or include `org_id` in grouping.

## 13) System Metrics (Observability)

`system_metrics`

Stores the latest operational metrics per org (updated by jobs).

- `org_id uuid not null references orgs(id) on delete cascade`
- `key text not null`
- `value numeric not null default 0`
- `unit text`
- `metadata jsonb not null default '{}'::jsonb`
- `recorded_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- Primary key: `(org_id, key)`

RLS:

- SELECT is restricted to org members with `org_role(org_id) = 'admin'`.

## 14) RPC Functions (Analytics)

Dashboard RPCs (active org scoped):

- `dashboard_kpis(from_ts timestamptz, to_ts timestamptz) -> jsonb`
- `dashboard_call_volume(from_ts timestamptz, to_ts timestamptz) -> (hour, calls)`
- `dashboard_revenue_trend(from_ts timestamptz, to_ts timestamptz) -> (day, revenue)`
- `dashboard_top_destinations(from_ts timestamptz, to_ts timestamptz) -> (destination_country, calls, revenue)`
- `dashboard_recent_alerts(from_ts timestamptz, to_ts timestamptz) -> recent alerts`
- `dashboard_recent_cases(from_ts timestamptz, to_ts timestamptz) -> recent cases`

Analytics RPCs (active org scoped):

- `analytics_revenue_leakage(from_ts, to_ts) -> jsonb`
- `analytics_roaming_activity(from_ts, to_ts) -> jsonb`
- `analytics_interconnect_variance(from_date, to_date) -> jsonb`
- `analytics_fraud_patterns(from_ts, to_ts) -> jsonb`
