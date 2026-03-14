-- TeleGuard Pro: telecom domain models (multi-tenant)
-- Adds additional entities needed for revenue assurance & fraud analytics.
-- NOTE: Does not modify existing tables.

-- 1) Tables

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  msisdn text not null,
  imsi text,
  imei text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscribers_org_msisdn_unique unique (org_id, msisdn)
);

create table if not exists public.networks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  mcc text,
  mnc text,
  country_code text,
  network_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  service_type text not null default 'voice',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tariffs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  currency text not null default 'USD',
  effective_from timestamptz,
  effective_to timestamptz,
  rates jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  partner_type text not null default 'carrier',
  country_code text,
  contact_email text,
  contact_phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  agreement_type text not null default 'interconnect',
  start_date date,
  end_date date,
  terms jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  agreement_id uuid references public.agreements(id) on delete set null,
  period_start date not null,
  period_end date not null,
  currency text not null default 'USD',
  amount_due numeric(18,6) not null default 0,
  amount_paid numeric(18,6) not null default 0,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  source_a text not null,
  source_b text not null,
  period_start date,
  period_end date,
  status text not null default 'draft',
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  report_type text not null default 'analytics',
  schedule_cron text,
  last_run_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Indexes (required)
create index if not exists subscribers_msisdn_idx on public.subscribers (msisdn);
create index if not exists subscribers_org_id_idx on public.subscribers (org_id);
create index if not exists subscribers_created_at_idx on public.subscribers (created_at desc);

create index if not exists networks_org_id_idx on public.networks (org_id);
create index if not exists networks_created_at_idx on public.networks (created_at desc);

create index if not exists services_org_id_idx on public.services (org_id);
create index if not exists services_created_at_idx on public.services (created_at desc);

create index if not exists tariffs_org_id_idx on public.tariffs (org_id);
create index if not exists tariffs_created_at_idx on public.tariffs (created_at desc);

create index if not exists partners_org_id_idx on public.partners (org_id);
create index if not exists partners_created_at_idx on public.partners (created_at desc);

create index if not exists agreements_org_id_idx on public.agreements (org_id);
create index if not exists agreements_created_at_idx on public.agreements (created_at desc);

create index if not exists settlements_org_id_idx on public.settlements (org_id);
create index if not exists settlements_created_at_idx on public.settlements (created_at desc);

create index if not exists reconciliations_org_id_idx on public.reconciliations (org_id);
create index if not exists reconciliations_created_at_idx on public.reconciliations (created_at desc);

create index if not exists reports_org_id_idx on public.reports (org_id);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- 3) updated_at triggers (reuse public.set_updated_at())
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_subscribers_set_updated_at') then
    create trigger trg_subscribers_set_updated_at
    before update on public.subscribers
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_networks_set_updated_at') then
    create trigger trg_networks_set_updated_at
    before update on public.networks
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_services_set_updated_at') then
    create trigger trg_services_set_updated_at
    before update on public.services
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_tariffs_set_updated_at') then
    create trigger trg_tariffs_set_updated_at
    before update on public.tariffs
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_partners_set_updated_at') then
    create trigger trg_partners_set_updated_at
    before update on public.partners
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_agreements_set_updated_at') then
    create trigger trg_agreements_set_updated_at
    before update on public.agreements
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_settlements_set_updated_at') then
    create trigger trg_settlements_set_updated_at
    before update on public.settlements
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_reconciliations_set_updated_at') then
    create trigger trg_reconciliations_set_updated_at
    before update on public.reconciliations
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_reports_set_updated_at') then
    create trigger trg_reports_set_updated_at
    before update on public.reports
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- 4) RLS enable
alter table public.subscribers enable row level security;
alter table public.networks enable row level security;
alter table public.services enable row level security;
alter table public.tariffs enable row level security;
alter table public.partners enable row level security;
alter table public.agreements enable row level security;
alter table public.settlements enable row level security;
alter table public.reconciliations enable row level security;
alter table public.reports enable row level security;

-- 5) Policies (same pattern as existing tables)

-- subscribers
drop policy if exists subscribers_select on public.subscribers;
create policy subscribers_select on public.subscribers
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists subscribers_insert on public.subscribers;
create policy subscribers_insert on public.subscribers
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists subscribers_update on public.subscribers;
create policy subscribers_update on public.subscribers
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists subscribers_delete on public.subscribers;
create policy subscribers_delete on public.subscribers
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- networks
drop policy if exists networks_select on public.networks;
create policy networks_select on public.networks
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists networks_insert on public.networks;
create policy networks_insert on public.networks
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists networks_update on public.networks;
create policy networks_update on public.networks
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists networks_delete on public.networks;
create policy networks_delete on public.networks
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- services
drop policy if exists services_select on public.services;
create policy services_select on public.services
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists services_insert on public.services;
create policy services_insert on public.services
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists services_update on public.services;
create policy services_update on public.services
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists services_delete on public.services;
create policy services_delete on public.services
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- tariffs
drop policy if exists tariffs_select on public.tariffs;
create policy tariffs_select on public.tariffs
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists tariffs_insert on public.tariffs;
create policy tariffs_insert on public.tariffs
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists tariffs_update on public.tariffs;
create policy tariffs_update on public.tariffs
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists tariffs_delete on public.tariffs;
create policy tariffs_delete on public.tariffs
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- partners
drop policy if exists partners_select on public.partners;
create policy partners_select on public.partners
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists partners_insert on public.partners;
create policy partners_insert on public.partners
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists partners_update on public.partners;
create policy partners_update on public.partners
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists partners_delete on public.partners;
create policy partners_delete on public.partners
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- agreements
drop policy if exists agreements_select on public.agreements;
create policy agreements_select on public.agreements
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists agreements_insert on public.agreements;
create policy agreements_insert on public.agreements
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists agreements_update on public.agreements;
create policy agreements_update on public.agreements
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists agreements_delete on public.agreements;
create policy agreements_delete on public.agreements
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- settlements
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- reconciliations
drop policy if exists reconciliations_select on public.reconciliations;
create policy reconciliations_select on public.reconciliations
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists reconciliations_insert on public.reconciliations;
create policy reconciliations_insert on public.reconciliations
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists reconciliations_update on public.reconciliations;
create policy reconciliations_update on public.reconciliations
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists reconciliations_delete on public.reconciliations;
create policy reconciliations_delete on public.reconciliations
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- reports
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
for delete to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

