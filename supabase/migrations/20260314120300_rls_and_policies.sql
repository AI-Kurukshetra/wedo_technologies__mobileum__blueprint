-- TeleGuard Pro: helper functions + updated_at triggers + RLS + policies

-- 1) Helper functions
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = $1
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(org_id uuid)
returns public.role_type
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.role
  from public.org_memberships m
  where m.org_id = $1
    and m.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_role(uuid) to authenticated;

-- 2) updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_orgs_set_updated_at') then
    create trigger trg_orgs_set_updated_at
    before update on public.orgs
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_fraud_rules_set_updated_at') then
    create trigger trg_fraud_rules_set_updated_at
    before update on public.fraud_rules
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cases_set_updated_at') then
    create trigger trg_cases_set_updated_at
    before update on public.cases
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_notification_policies_set_updated_at') then
    create trigger trg_notification_policies_set_updated_at
    before update on public.notification_policies
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- 3) Enable RLS
alter table public.orgs enable row level security;
alter table public.org_memberships enable row level security;
alter table public.audit_log enable row level security;
alter table public.cdr_imports enable row level security;
alter table public.cdr_records enable row level security;
alter table public.cdr_aggregates_hourly enable row level security;
alter table public.cdr_aggregates_daily enable row level security;
alter table public.fraud_rules enable row level security;
alter table public.fraud_rule_versions enable row level security;
alter table public.alerts enable row level security;
alter table public.cases enable row level security;
alter table public.case_alerts enable row level security;
alter table public.case_events enable row level security;
alter table public.attachments enable row level security;
alter table public.notification_policies enable row level security;

-- 4) Policies

-- orgs
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists orgs_insert on public.orgs;
create policy orgs_insert on public.orgs
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs
for update
to authenticated
using (public.org_role(id) = 'admin')
with check (public.org_role(id) = 'admin');

drop policy if exists orgs_delete on public.orgs;
create policy orgs_delete on public.orgs
for delete
to authenticated
using (public.org_role(id) = 'admin');

-- org_memberships
drop policy if exists org_memberships_select on public.org_memberships;
create policy org_memberships_select on public.org_memberships
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists org_memberships_insert on public.org_memberships;
create policy org_memberships_insert on public.org_memberships
for insert
to authenticated
with check (public.org_role(org_id) = 'admin');

drop policy if exists org_memberships_update on public.org_memberships;
create policy org_memberships_update on public.org_memberships
for update
to authenticated
using (public.org_role(org_id) = 'admin')
with check (public.org_role(org_id) = 'admin');

drop policy if exists org_memberships_delete on public.org_memberships;
create policy org_memberships_delete on public.org_memberships
for delete
to authenticated
using (public.org_role(org_id) = 'admin');

-- audit_log
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- cdr_imports
drop policy if exists cdr_imports_select on public.cdr_imports;
create policy cdr_imports_select on public.cdr_imports
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists cdr_imports_insert on public.cdr_imports;
create policy cdr_imports_insert on public.cdr_imports
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists cdr_imports_update on public.cdr_imports;
create policy cdr_imports_update on public.cdr_imports
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists cdr_imports_delete on public.cdr_imports;
create policy cdr_imports_delete on public.cdr_imports
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- cdr_records
drop policy if exists cdr_records_select on public.cdr_records;
create policy cdr_records_select on public.cdr_records
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists cdr_records_insert on public.cdr_records;
create policy cdr_records_insert on public.cdr_records
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists cdr_records_update on public.cdr_records;
create policy cdr_records_update on public.cdr_records
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists cdr_records_delete on public.cdr_records;
create policy cdr_records_delete on public.cdr_records
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- aggregates (select-only for members; writes typically service role/job)
drop policy if exists cdr_agg_hourly_select on public.cdr_aggregates_hourly;
create policy cdr_agg_hourly_select on public.cdr_aggregates_hourly
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists cdr_agg_daily_select on public.cdr_aggregates_daily;
create policy cdr_agg_daily_select on public.cdr_aggregates_daily
for select
to authenticated
using (public.is_org_member(org_id));

-- fraud_rules
drop policy if exists fraud_rules_select on public.fraud_rules;
create policy fraud_rules_select on public.fraud_rules
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists fraud_rules_insert on public.fraud_rules;
create policy fraud_rules_insert on public.fraud_rules
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists fraud_rules_update on public.fraud_rules;
create policy fraud_rules_update on public.fraud_rules
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists fraud_rules_delete on public.fraud_rules;
create policy fraud_rules_delete on public.fraud_rules
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- fraud_rule_versions (immutable snapshots: select + insert only)
drop policy if exists fraud_rule_versions_select on public.fraud_rule_versions;
create policy fraud_rule_versions_select on public.fraud_rule_versions
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists fraud_rule_versions_insert on public.fraud_rule_versions;
create policy fraud_rule_versions_insert on public.fraud_rule_versions
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- alerts
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists alerts_delete on public.alerts;
create policy alerts_delete on public.alerts
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- cases
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists cases_delete on public.cases;
create policy cases_delete on public.cases
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- case_alerts
drop policy if exists case_alerts_select on public.case_alerts;
create policy case_alerts_select on public.case_alerts
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists case_alerts_insert on public.case_alerts;
create policy case_alerts_insert on public.case_alerts
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists case_alerts_delete on public.case_alerts;
create policy case_alerts_delete on public.case_alerts
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- case_events
drop policy if exists case_events_select on public.case_events;
create policy case_events_select on public.case_events
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists case_events_insert on public.case_events;
create policy case_events_insert on public.case_events
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists case_events_update on public.case_events;
create policy case_events_update on public.case_events
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'))
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists case_events_delete on public.case_events;
create policy case_events_delete on public.case_events
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- attachments
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

-- notification_policies
drop policy if exists notification_policies_select on public.notification_policies;
create policy notification_policies_select on public.notification_policies
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists notification_policies_insert on public.notification_policies;
create policy notification_policies_insert on public.notification_policies
for insert
to authenticated
with check (public.org_role(org_id) in ('admin', 'manager'));

drop policy if exists notification_policies_update on public.notification_policies;
create policy notification_policies_update on public.notification_policies
for update
to authenticated
using (public.org_role(org_id) in ('admin', 'manager'))
with check (public.org_role(org_id) in ('admin', 'manager'));

drop policy if exists notification_policies_delete on public.notification_policies;
create policy notification_policies_delete on public.notification_policies
for delete
to authenticated
using (public.org_role(org_id) in ('admin', 'manager'));

