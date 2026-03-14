-- TeleGuard Pro: enterprise revenue assurance extensions
-- Adds reconciliation results, revenue recovery events, data quality runs,
-- billing connector configs, optional network elements, and report scheduling metadata.

-- 1) Report scheduling/runtime metadata
alter table public.reports
  add column if not exists recipients text[] not null default '{}'::text[],
  add column if not exists last_run_status text,
  add column if not exists last_run_error text,
  add column if not exists last_output_path text;

create index if not exists reports_org_schedule_idx on public.reports (org_id, schedule_cron);
create index if not exists reports_org_last_run_idx on public.reports (org_id, last_run_at desc);

-- 2) Revenue recovery events
create table if not exists public.revenue_recovery_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  alert_id uuid references public.alerts(id) on delete set null,
  amount numeric(18,6) not null,
  currency text not null default 'USD',
  notes text,
  recorded_by_user_id uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint revenue_recovery_events_case_or_alert_chk check (case_id is not null or alert_id is not null)
);

create index if not exists revenue_recovery_events_org_id_idx on public.revenue_recovery_events (org_id);
create index if not exists revenue_recovery_events_org_recorded_at_idx on public.revenue_recovery_events (org_id, recorded_at desc);
create index if not exists revenue_recovery_events_org_case_idx on public.revenue_recovery_events (org_id, case_id);
create index if not exists revenue_recovery_events_org_alert_idx on public.revenue_recovery_events (org_id, alert_id);

alter table public.revenue_recovery_events enable row level security;

drop policy if exists revenue_recovery_events_select on public.revenue_recovery_events;
create policy revenue_recovery_events_select on public.revenue_recovery_events
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists revenue_recovery_events_insert on public.revenue_recovery_events;
create policy revenue_recovery_events_insert on public.revenue_recovery_events
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists revenue_recovery_events_update on public.revenue_recovery_events;
create policy revenue_recovery_events_update on public.revenue_recovery_events
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists revenue_recovery_events_delete on public.revenue_recovery_events;
create policy revenue_recovery_events_delete on public.revenue_recovery_events
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- 3) Reconciliation results (child rows for mismatch details)
create table if not exists public.reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  reconciliation_id uuid not null references public.reconciliations(id) on delete cascade,
  status text not null default 'mismatch',
  match_key text,
  source_a_value numeric(18,6),
  source_b_value numeric(18,6),
  delta numeric(18,6),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reconciliation_results_org_id_idx on public.reconciliation_results (org_id);
create index if not exists reconciliation_results_reconciliation_id_idx on public.reconciliation_results (reconciliation_id, created_at desc);
create index if not exists reconciliation_results_status_idx on public.reconciliation_results (org_id, status);

alter table public.reconciliation_results enable row level security;

drop policy if exists reconciliation_results_select on public.reconciliation_results;
create policy reconciliation_results_select on public.reconciliation_results
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists reconciliation_results_insert on public.reconciliation_results;
create policy reconciliation_results_insert on public.reconciliation_results
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists reconciliation_results_update on public.reconciliation_results;
create policy reconciliation_results_update on public.reconciliation_results
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists reconciliation_results_delete on public.reconciliation_results;
create policy reconciliation_results_delete on public.reconciliation_results
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- 4) Data quality runs
create table if not exists public.data_quality_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  period_start timestamptz,
  period_end timestamptz,
  status text not null default 'passed',
  checks_total int not null default 0,
  checks_failed int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists data_quality_runs_org_id_idx on public.data_quality_runs (org_id);
create index if not exists data_quality_runs_org_created_at_idx on public.data_quality_runs (org_id, created_at desc);
create index if not exists data_quality_runs_org_status_idx on public.data_quality_runs (org_id, status);

alter table public.data_quality_runs enable row level security;

drop policy if exists data_quality_runs_select on public.data_quality_runs;
create policy data_quality_runs_select on public.data_quality_runs
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists data_quality_runs_insert on public.data_quality_runs;
create policy data_quality_runs_insert on public.data_quality_runs
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists data_quality_runs_update on public.data_quality_runs;
create policy data_quality_runs_update on public.data_quality_runs
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists data_quality_runs_delete on public.data_quality_runs;
create policy data_quality_runs_delete on public.data_quality_runs
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- 5) Billing connectors
create table if not exists public.billing_connectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  connector_type text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_connectors_org_name_unique unique (org_id, name)
);

create index if not exists billing_connectors_org_id_idx on public.billing_connectors (org_id);
create index if not exists billing_connectors_org_enabled_idx on public.billing_connectors (org_id, enabled);
create index if not exists billing_connectors_org_type_idx on public.billing_connectors (org_id, connector_type);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_connectors_set_updated_at') then
    create trigger trg_billing_connectors_set_updated_at
    before update on public.billing_connectors
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.billing_connectors enable row level security;

drop policy if exists billing_connectors_select on public.billing_connectors;
create policy billing_connectors_select on public.billing_connectors
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists billing_connectors_insert on public.billing_connectors;
create policy billing_connectors_insert on public.billing_connectors
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists billing_connectors_update on public.billing_connectors;
create policy billing_connectors_update on public.billing_connectors
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists billing_connectors_delete on public.billing_connectors;
create policy billing_connectors_delete on public.billing_connectors
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- 6) Optional network elements
create table if not exists public.network_elements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  element_type text not null,
  identifier text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint network_elements_org_identifier_unique unique (org_id, identifier)
);

create index if not exists network_elements_org_id_idx on public.network_elements (org_id);
create index if not exists network_elements_org_type_idx on public.network_elements (org_id, element_type);
create index if not exists network_elements_org_created_at_idx on public.network_elements (org_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_network_elements_set_updated_at') then
    create trigger trg_network_elements_set_updated_at
    before update on public.network_elements
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.network_elements enable row level security;

drop policy if exists network_elements_select on public.network_elements;
create policy network_elements_select on public.network_elements
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists network_elements_insert on public.network_elements;
create policy network_elements_insert on public.network_elements
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists network_elements_update on public.network_elements;
create policy network_elements_update on public.network_elements
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists network_elements_delete on public.network_elements;
create policy network_elements_delete on public.network_elements
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));
