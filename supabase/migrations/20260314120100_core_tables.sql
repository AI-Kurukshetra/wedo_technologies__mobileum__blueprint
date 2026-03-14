-- TeleGuard Pro: core tables + constraints

-- 1) Orgs & RBAC
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role public.role_type not null default 'analyst',
  created_at timestamptz not null default now(),
  constraint org_memberships_org_user_unique unique (org_id, user_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 2) CDR ingestion & records
create table if not exists public.cdr_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  uploaded_by_user_id uuid references auth.users(id),
  status public.import_status not null default 'uploaded',
  source text not null default 'csv_upload',
  original_filename text,
  storage_object_path text not null,
  started_at timestamptz,
  finished_at timestamptz,
  row_count_total int not null default 0,
  row_count_ok int not null default 0,
  row_count_failed int not null default 0,
  error_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.cdr_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  import_id uuid not null references public.cdr_imports(id) on delete cascade,
  source_row_number int,
  source_row_hash text not null,
  call_start_at timestamptz not null,
  call_end_at timestamptz,
  duration_seconds int not null default 0,
  direction text,
  answer_status text,
  a_party text,
  b_party text,
  destination_prefix text,
  destination_country text,
  account_id text,
  carrier_id text,
  imsi text,
  imei text,
  revenue_amount numeric(18,6),
  cost_amount numeric(18,6),
  currency text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cdr_records_import_hash_unique unique (import_id, source_row_hash)
);

-- 3) Aggregates
create table if not exists public.cdr_aggregates_hourly (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bucket_start_at timestamptz not null,
  dimension_type text not null,
  dimension_value text not null,
  call_count int not null,
  total_duration_seconds bigint not null,
  total_revenue numeric(18,6) not null default 0,
  total_cost numeric(18,6) not null default 0,
  answered_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint cdr_aggregates_hourly_unique unique (org_id, bucket_start_at, dimension_type, dimension_value)
);

create table if not exists public.cdr_aggregates_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bucket_start_at timestamptz not null,
  dimension_type text not null,
  dimension_value text not null,
  call_count int not null,
  total_duration_seconds bigint not null,
  total_revenue numeric(18,6) not null default 0,
  total_cost numeric(18,6) not null default 0,
  answered_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint cdr_aggregates_daily_unique unique (org_id, bucket_start_at, dimension_type, dimension_value)
);

-- 4) Fraud rules
create table if not exists public.fraud_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  description text,
  status public.rule_status not null default 'draft',
  severity public.severity not null default 'medium',
  window_minutes int not null default 15,
  dimension_type text not null,
  conditions jsonb not null,
  dedup_minutes int not null default 60,
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fraud_rule_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid not null references public.fraud_rules(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint fraud_rule_versions_rule_version_unique unique (rule_id, version)
);

-- 5) Alerts
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid not null references public.fraud_rules(id),
  rule_version_id uuid not null references public.fraud_rule_versions(id),
  status public.alert_status not null default 'new',
  severity public.severity not null,
  title text not null,
  dedup_key text not null,
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  dimension_type text not null,
  dimension_value text not null,
  evidence jsonb not null default '{}'::jsonb,
  assigned_to_user_id uuid references auth.users(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_type text,
  resolution_reason text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint alerts_dedup_unique unique (org_id, dedup_key, window_start_at)
);

-- 6) Cases
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null,
  description text,
  status public.case_status not null default 'open',
  severity public.severity not null default 'medium',
  owner_user_id uuid references auth.users(id),
  created_by_user_id uuid references auth.users(id),
  closed_at timestamptz,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint case_alerts_case_alert_unique unique (case_id, alert_id)
);

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete cascade,
  uploaded_by_user_id uuid references auth.users(id),
  storage_object_path text not null,
  filename text not null,
  content_type text,
  bytes bigint,
  created_at timestamptz not null default now()
);

-- 7) Notification policies
create table if not exists public.notification_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  enabled boolean not null default true,
  min_severity public.severity not null default 'high',
  email_recipients text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

