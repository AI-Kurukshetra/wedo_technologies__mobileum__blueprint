-- TeleGuard Pro: fix pgcrypto usage for seed_realistic_data() (digest signature)

create extension if not exists "pgcrypto";

drop function if exists public.seed_realistic_data();
create function public.seed_realistic_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  claims_text text;
  claims jsonb;
  jwt_role text;
  demo_org_id uuid;
  demo_import_id uuid;
  demo_rule_id uuid;
  demo_rule_version_id uuid;
  inserted_cdr bigint;
  inserted_alerts bigint;
  inserted_cases bigint;
begin
  claims_text := current_setting('request.jwt.claims', true);
  if claims_text is null or claims_text = '' then
    claims := '{}'::jsonb;
  else
    claims := claims_text::jsonb;
  end if;

  jwt_role := coalesce(
    auth.role(),
    claims->>'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );

  if jwt_role <> 'service_role' then
    raise exception 'seed_realistic_data: forbidden' using errcode = '42501';
  end if;

  truncate table public.alerts restart identity cascade;
  truncate table public.cases restart identity cascade;
  truncate table public.cdr_records restart identity cascade;

  insert into public.orgs (name, slug)
  values ('TeleGuard Demo Telecom', 'teleguard-demo')
  on conflict (slug) do update set name = excluded.name
  returning id into demo_org_id;

  if demo_org_id is null then
    select id into demo_org_id from public.orgs where slug = 'teleguard-demo' limit 1;
  end if;

  insert into public.org_memberships (org_id, user_id, role)
  select
    demo_org_id,
    u.id,
    case
      when row_number() over (order by u.created_at asc) = 1 then 'admin'::public.role_type
      when row_number() over (order by u.created_at asc) = 2 then 'manager'::public.role_type
      else 'analyst'::public.role_type
    end
  from auth.users u
  on conflict (org_id, user_id) do nothing;

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
    demo_org_id,
    (select user_id from public.org_memberships where org_id = demo_org_id order by created_at asc limit 1),
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
  returning id into demo_import_id;

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
    demo_org_id,
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
    (select user_id from public.org_memberships where org_id = demo_org_id order by created_at asc limit 1),
    (select user_id from public.org_memberships where org_id = demo_org_id order by created_at asc limit 1)
  )
  returning id into demo_rule_id;

  insert into public.fraud_rule_versions (org_id, rule_id, version, snapshot, created_by_user_id)
  values (
    demo_org_id,
    demo_rule_id,
    1,
    jsonb_build_object('name','Demo: International traffic anomaly','version',1,'dimension_type','destination_country','seed',true),
    (select user_id from public.org_memberships where org_id = demo_org_id order by created_at asc limit 1)
  )
  on conflict (rule_id, version) do update set snapshot = excluded.snapshot
  returning id into demo_rule_version_id;

  with gs as (select g as n from generate_series(1, 50000) g),
  base as (
    select
      demo_org_id as org_id,
      demo_import_id as import_id,
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
      encode(
        digest(convert_to(concat_ws('|', org_id, import_id, call_start_at::text, duration_seconds::text, destination_country, n::text), 'utf8'), 'sha256'),
        'hex'
      ) as source_row_hash,
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

  get diagnostics inserted_cdr = row_count;

  -- Alerts (80)
  with gs as (select g as n from generate_series(1, 80) g),
  base as (
    select
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
      demo_org_id as org_id,
      demo_rule_id as rule_id,
      demo_rule_version_id as rule_version_id,
      status,
      severity,
      format(template, case when template like '%Carrier failure spike%' then carrier else dest end) as title,
      encode(gen_random_bytes(16), 'hex') as dedup_key,
      created_at - interval '15 minutes' as window_start_at,
      created_at as window_end_at,
      case when template like '%Carrier failure spike%' then 'carrier_id' else 'destination_country' end as dimension_type,
      case when template like '%Carrier failure spike%' then carrier else dest end as dimension_value,
      jsonb_build_object('seed', true, 'carrier', carrier, 'destination', dest) as evidence
    from titles
  )
  insert into public.alerts (
    org_id, rule_id, rule_version_id, status, severity, title, dedup_key,
    window_start_at, window_end_at, dimension_type, dimension_value, evidence,
    assigned_to_user_id, acknowledged_at, resolved_at, resolution_type, resolution_reason, notified_at
  )
  select
    org_id, rule_id, rule_version_id, status, severity, title, dedup_key,
    window_start_at, window_end_at, dimension_type, dimension_value, evidence,
    null,
    case when status in ('acknowledged'::public.alert_status, 'resolved'::public.alert_status) then window_end_at + interval '5 minutes' else null end,
    case when status = 'resolved'::public.alert_status then window_end_at + interval '30 minutes' else null end,
    case when status = 'resolved'::public.alert_status then (array['false_positive','mitigated','blocked','confirmed_fraud'])[1 + floor(random() * 4)::int] else null end,
    case when status = 'resolved'::public.alert_status then (array['Auto-blocked route','Carrier notified','Rate limited gateway','Manual review complete'])[1 + floor(random() * 4)::int] else null end,
    null
  from final;

  get diagnostics inserted_alerts = row_count;

  -- Cases (25)
  with owners as (
    select m.user_id, row_number() over (order by m.created_at asc) as rn
    from public.org_memberships m
    where m.org_id = demo_org_id
    limit 2
  ),
  gs as (select g as n from generate_series(1, 25) g),
  base as (
    select
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
      demo_org_id as org_id,
      case
        when focus = 'NG' then 'International fraud investigation — NG route'
        when focus = 'PK' then 'Suspicious call pattern — PK region'
        when focus = 'US' then 'Revenue spike investigation — US gateway'
        when focus = 'GB' then 'International traffic anomaly — GB route'
        else 'International fraud investigation — IN route'
      end as title,
      status,
      severity,
      owner_label,
      (select user_id from owners where rn = (case when owner_label = 'Analyst' then 1 else 2 end) limit 1) as owner_user_id,
      (select user_id from owners order by rn limit 1) as created_by_user_id,
      carrier,
      focus
    from base
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

  get diagnostics inserted_cases = row_count;

  return jsonb_build_object(
    'org_slug', 'teleguard-demo',
    'cdr_records', inserted_cdr,
    'alerts', inserted_alerts,
    'cases', inserted_cases
  );
end;
$$;

grant execute on function public.seed_realistic_data() to service_role;

