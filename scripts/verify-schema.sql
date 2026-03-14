-- TeleGuard Pro schema verification queries (run in Supabase SQL editor or via CLI)
-- This script reports missing/extra objects vs expected schema.

-- 1) Enums
with expected as (
  select * from (values
    ('role_type'),
    ('import_status'),
    ('rule_status'),
    ('alert_status'),
    ('case_status'),
    ('severity')
  ) as t(type_name)
),
actual as (
  select t.typname as type_name
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e'
),
missing as (
  select e.type_name from expected e
  left join actual a using (type_name)
  where a.type_name is null
),
extra as (
  select a.type_name from actual a
  left join expected e using (type_name)
  where e.type_name is null
)
select 'ENUM_MISSING' as check, type_name as value from missing
union all
select 'ENUM_EXTRA' as check, type_name as value from extra
order by check, value;

-- 2) Tables
with expected as (
  select * from (values
    ('orgs'),
    ('org_memberships'),
    ('audit_log'),
    ('cdr_imports'),
    ('cdr_records'),
    ('cdr_aggregates_hourly'),
    ('cdr_aggregates_daily'),
    ('fraud_rules'),
    ('fraud_rule_versions'),
    ('alerts'),
    ('cases'),
    ('case_alerts'),
    ('case_events'),
    ('attachments'),
    ('notification_policies')
  ) as t(table_name)
),
actual as (
  select tablename as table_name
  from pg_tables
  where schemaname = 'public'
),
missing as (
  select e.table_name from expected e
  left join actual a using (table_name)
  where a.table_name is null
),
extra as (
  select a.table_name from actual a
  left join expected e using (table_name)
  where e.table_name is null
)
select 'TABLE_MISSING' as check, table_name as value from missing
union all
select 'TABLE_EXTRA' as check, table_name as value from extra
order by check, value;

-- 3) RLS enabled?
with expected as (
  select * from (values
    ('orgs'),
    ('org_memberships'),
    ('audit_log'),
    ('cdr_imports'),
    ('cdr_records'),
    ('cdr_aggregates_hourly'),
    ('cdr_aggregates_daily'),
    ('fraud_rules'),
    ('fraud_rule_versions'),
    ('alerts'),
    ('cases'),
    ('case_alerts'),
    ('case_events'),
    ('attachments'),
    ('notification_policies')
  ) as t(table_name)
),
rls as (
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
)
select 'RLS_DISABLED' as check, e.table_name as value
from expected e
join rls using (table_name)
where rls_enabled = false
order by value;

-- 4) Helper functions
with expected as (
  select * from (values
    ('is_org_member'),
    ('org_role')
  ) as t(fn_name)
),
actual as (
  select p.proname as fn_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
missing as (
  select e.fn_name from expected e
  left join actual a using (fn_name)
  where a.fn_name is null
)
select 'FUNCTION_MISSING' as check, fn_name as value
from missing
order by value;

-- 5) Policies summary (per table)
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6) Index list (human check)
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

