-- TeleGuard Pro: realistic telecom analytics demo seed
-- Safe to run in Supabase SQL editor. Uses set-based inserts (generate_series) and no procedural loops.

begin;

-- Ensure pgcrypto is available (Supabase typically installs it in `extensions`)
create extension if not exists "pgcrypto";

-- 1) Remove existing placeholder/demo data (and dependents)
truncate table public.alerts restart identity cascade;
truncate table public.cases restart identity cascade;
truncate table public.cdr_records restart identity cascade;

-- 2) Ensure a demo org + memberships (best-effort: all existing auth.users)
with demo_org as (
  insert into public.orgs (name, slug)
  values ('TeleGuard Demo Telecom', 'teleguard-demo')
  on conflict (slug) do update set name = excluded.name
  returning id
),
memberships as (
  insert into public.org_memberships (org_id, user_id, role)
  select
    (select id from demo_org),
    u.id,
    case
      when row_number() over (order by u.created_at asc) = 1 then 'admin'::public.role_type
      when row_number() over (order by u.created_at asc) = 2 then 'manager'::public.role_type
      else 'analyst'::public.role_type
    end
  from auth.users u
  on conflict (org_id, user_id) do nothing
  returning user_id
),
demo_import as (
  insert into public.cdr_imports (
    org_id,
    uploaded_by_user_id,
    status,
    source,
    original_filename,
    storage_object_path,
    started_at,
    finished_at,
    row_count_total,
    row_count_ok,
    row_count_failed
  )
  values (
    (select id from demo_org),
    (select user_id from memberships order by user_id limit 1),
    'processed'::public.import_status,
    'demo_seed',
    'teleguard_demo_seed.csv',
    'demo/teleguard-demo/teleguard_demo_seed.csv',
    now() - interval '3 minutes',
    now() - interval '2 minutes',
    50000,
    50000,
    0
  )
  returning id, org_id
),
demo_rule as (
  insert into public.fraud_rules (
    org_id,
    name,
    description,
    status,
    severity,
    window_minutes,
    dimension_type,
    conditions,
    dedup_minutes,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    (select org_id from demo_import),
    'Demo: International traffic anomaly',
    'Realistic demo rule pack for dashboards and investigations.',
    'enabled'::public.rule_status,
    'high'::public.severity,
    15,
    'destination_country',
    jsonb_build_object(
      'thresholds', jsonb_build_array(
        jsonb_build_object('metric','call_count','op','>=','value',500),
        jsonb_build_object('metric','total_revenue','op','>=','value',1500)
      )
    ),
    60,
    (select user_id from memberships order by user_id limit 1),
    (select user_id from memberships order by user_id limit 1)
  )
  returning id, org_id
),
demo_rule_version as (
  insert into public.fraud_rule_versions (org_id, rule_id, version, snapshot, created_by_user_id)
  values (
    (select org_id from demo_rule),
    (select id from demo_rule),
    1,
    jsonb_build_object('name','Demo: International traffic anomaly','version',1,'seed',true),
    (select user_id from memberships order by user_id limit 1)
  )
  on conflict (rule_id, version) do update set snapshot = excluded.snapshot
  returning id, rule_id, org_id
)
select 1;

-- 3) Insert 50,000 realistic CDRs spanning last 14 days
with ctx as (
  select
    (select id from public.orgs where slug = 'teleguard-demo') as org_id,
    (select id from public.cdr_imports where storage_object_path = 'demo/teleguard-demo/teleguard_demo_seed.csv' order by created_at desc limit 1) as import_id
),
gs as (select g as n from generate_series(1, 50000) g),
base as (
  select
    (select org_id from ctx) as org_id,
    (select import_id from ctx) as import_id,
    n,
    (now() - (random() * interval '14 days')) as call_start_at,
    (20 + floor(random() * 581))::int as duration_seconds,
    case
      when random() < 0.35 then 'US'
      when random() < 0.50 then 'GB'
      when random() < 0.60 then 'PK'
      when random() < 0.70 then 'NG'
      when random() < 0.80 then 'IN'
      else (array['CA','AU','DE','FR','ES','GH','AE','SG','ZA','BR'])[1 + floor(random() * 10)::int]
    end as destination_country,
    round((0.05 + random() * 2.95)::numeric, 6) as revenue_amount
  from gs
),
enriched as (
  select
    org_id,
    import_id,
    null::int as source_row_number,
    (encode(extensions.gen_random_bytes(16), 'hex') || '-' || n::text) as source_row_hash,
    call_start_at,
    (call_start_at + (duration_seconds || ' seconds')::interval) as call_end_at,
    duration_seconds,
    'outbound' as direction,
    (array['answered','answered','answered','failed','no_answer'])[1 + floor(random() * 5)::int] as answer_status,
    '+1' || (200 + floor(random() * 800))::int::text || lpad((floor(random() * 10000000))::int::text, 7, '0') as a_party,
    case destination_country
      when 'US' then '+1' || (200 + floor(random() * 800))::int::text || lpad((floor(random() * 10000000))::int::text, 7, '0')
      when 'GB' then '+44' || lpad((floor(random() * 1000000000))::bigint::text, 10, '0')
      when 'PK' then '+92' || lpad((floor(random() * 1000000000))::bigint::text, 10, '0')
      when 'NG' then '+234' || lpad((floor(random() * 1000000000))::bigint::text, 10, '0')
      when 'IN' then '+91' || lpad((floor(random() * 1000000000))::bigint::text, 10, '0')
      when 'CA' then '+1' || (200 + floor(random() * 800))::int::text || lpad((floor(random() * 10000000))::int::text, 7, '0')
      when 'AU' then '+61' || lpad((floor(random() * 1000000000))::bigint::text, 9, '0')
      when 'DE' then '+49' || lpad((floor(random() * 1000000000))::bigint::text, 10, '0')
      when 'FR' then '+33' || lpad((floor(random() * 1000000000))::bigint::text, 9, '0')
      when 'ES' then '+34' || lpad((floor(random() * 1000000000))::bigint::text, 9, '0')
      when 'GH' then '+233' || lpad((floor(random() * 1000000000))::bigint::text, 9, '0')
      else '+1' || (200 + floor(random() * 800))::int::text || lpad((floor(random() * 10000000))::int::text, 7, '0')
    end as b_party,
    case destination_country
      when 'US' then '+1'
      when 'GB' then '+44'
      when 'PK' then '+92'
      when 'NG' then '+234'
      when 'IN' then '+91'
      when 'CA' then '+1'
      when 'AU' then '+61'
      when 'DE' then '+49'
      when 'FR' then '+33'
      when 'ES' then '+34'
      when 'GH' then '+233'
      else '+1'
    end as destination_prefix,
    destination_country,
    (array['ACME-001','ACME-002','ACME-003','ENT-100','ENT-200'])[1 + floor(random() * 5)::int] as account_id,
    (array['TRK-1','TRK-2','TRK-9','VIA-7','IGW-3'])[1 + floor(random() * 5)::int] as carrier_id,
    revenue_amount,
    round((revenue_amount * (0.60 + random() * 0.25))::numeric, 6) as cost_amount,
    'USD' as currency,
    jsonb_build_object('seed', true, 'note', 'realistic_demo') as raw
  from base
)
insert into public.cdr_records (
  org_id, import_id, source_row_number, source_row_hash,
  call_start_at, call_end_at, duration_seconds, direction, answer_status,
  a_party, b_party, destination_prefix, destination_country,
  account_id, carrier_id, imsi, imei,
  revenue_amount, cost_amount, currency, raw
)
select
  org_id, import_id, source_row_number, source_row_hash,
  call_start_at, call_end_at, duration_seconds, direction, answer_status,
  a_party, b_party, destination_prefix, destination_country,
  account_id, carrier_id, null, null,
  revenue_amount, cost_amount, currency, raw
from enriched;

-- 4) Insert 80 realistic alerts
with ctx as (
  select
    (select id from public.orgs where slug = 'teleguard-demo') as org_id,
    (select id from public.fraud_rules where org_id = (select id from public.orgs where slug = 'teleguard-demo') order by created_at desc limit 1) as rule_id,
    (select id from public.fraud_rule_versions where org_id = (select id from public.orgs where slug = 'teleguard-demo') order by created_at desc limit 1) as rule_version_id
),
gs as (select g as n from generate_series(1, 80) g),
base as (
  select
    (select org_id from ctx) as org_id,
    (select rule_id from ctx) as rule_id,
    (select rule_version_id from ctx) as rule_version_id,
    n,
    (now() - (random() * interval '10 days')) as created_at,
    case
      when random() < 0.30 then 'low'::public.severity
      when random() < 0.60 then 'medium'::public.severity
      when random() < 0.85 then 'high'::public.severity
      else 'critical'::public.severity
    end as severity,
    (array['new','acknowledged','resolved'])[1 + floor(random() * 3)::int]::public.alert_status as status,
    (array['US','GB','PK','NG','IN','CA','AU','DE'])[1 + floor(random() * 8)::int] as dest,
    (array['TRK-1','TRK-2','TRK-9','VIA-7'])[1 + floor(random() * 4)::int] as carrier
  from gs
),
titles as (
  select
    *,
    (array[
      'High international call volume — %s gateway',
      'Sudden traffic spike — %s destination',
      'Abnormal call duration pattern — %s route',
      'Revenue anomaly detected — %s route',
      'Carrier failure spike — %s'
    ])[1 + floor(random() * 5)::int] as template
  from base
),
final as (
  select
    org_id,
    rule_id,
    rule_version_id,
    status,
    severity,
    format(template, case when template like '%Carrier failure spike%' then carrier else dest end) as title,
    encode(extensions.gen_random_bytes(16), 'hex') as dedup_key,
    created_at - interval '15 minutes' as window_start_at,
    created_at as window_end_at,
    case when template like '%Carrier failure spike%' then 'carrier_id' else 'destination_country' end as dimension_type,
    case when template like '%Carrier failure spike%' then carrier else dest end as dimension_value,
    jsonb_build_object('seed', true, 'carrier', carrier, 'destination', dest) as evidence
  from titles
)
insert into public.alerts (
  org_id, rule_id, rule_version_id, status, severity, title, dedup_key,
  window_start_at, window_end_at, dimension_type, dimension_value, evidence
)
select
  org_id, rule_id, rule_version_id, status, severity, title, dedup_key,
  window_start_at, window_end_at, dimension_type, dimension_value, evidence
from final;

-- 5) Insert 25 realistic cases
with ctx as (
  select (select id from public.orgs where slug = 'teleguard-demo') as org_id
),
owners as (
  select m.user_id, row_number() over (order by m.created_at asc) as rn
  from public.org_memberships m
  where m.org_id = (select org_id from ctx)
  limit 2
),
gs as (select g as n from generate_series(1, 25) g),
base as (
  select
    (select org_id from ctx) as org_id,
    n,
    case
      when random() < 0.45 then 'open'::public.case_status
      when random() < 0.75 then 'in_review'::public.case_status
      else 'closed'::public.case_status
    end as status,
    case
      when random() < 0.30 then 'low'::public.severity
      when random() < 0.60 then 'medium'::public.severity
      when random() < 0.85 then 'high'::public.severity
      else 'critical'::public.severity
    end as severity,
    (array['NG','PK','US','GB','IN'])[1 + floor(random() * 5)::int] as focus,
    (array['TRK-9','TRK-2','VIA-7'])[1 + floor(random() * 3)::int] as carrier,
    case when random() < 0.6 then 'Analyst' else 'Manager' end as owner_label
  from gs
),
final as (
  select
    b.org_id,
    case
      when b.focus = 'NG' then 'International fraud investigation — NG route'
      when b.focus = 'PK' then 'Suspicious call pattern — PK region'
      when b.focus = 'US' then 'Revenue spike investigation — US gateway'
      when b.focus = 'GB' then 'International traffic anomaly — GB route'
      else 'International fraud investigation — IN route'
    end as title,
    b.status,
    b.severity,
    b.owner_label,
    (select user_id from owners where rn = (case when b.owner_label = 'Analyst' then 1 else 2 end) limit 1) as owner_user_id,
    (select user_id from owners order by rn limit 1) as created_by_user_id,
    b.carrier,
    b.focus
  from base b
)
insert into public.cases (
  org_id, title, description, status, severity, owner_user_id, created_by_user_id, closed_at, outcome
)
select
  org_id,
  title,
  concat(
    'Owner: ', owner_label, E'\n',
    'Carrier: ', carrier, E'\n',
    'Focus: ', focus, E'\n',
    'Next steps: Validate routing logs, correlate with carrier KPIs, and review top destinations.'
  ),
  status,
  severity,
  owner_user_id,
  created_by_user_id,
  case when status = 'closed'::public.case_status then now() - (random() * interval '5 days') else null end,
  case when status = 'closed'::public.case_status then (array['false_positive','mitigated','confirmed_fraud','carrier_issue'])[1 + floor(random() * 4)::int] else null end
from final;

commit;

