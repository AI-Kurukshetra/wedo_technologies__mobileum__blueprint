-- TeleGuard Pro: minimal "Run evaluation" RPC to generate fresh alerts (no truncation)
-- Generates a small batch of realistic alerts for the active org.

drop function if exists public.run_demo_evaluation();
create function public.run_demo_evaluation()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  org_id uuid;
  role public.role_type;
  rule_id uuid;
  rule_version_id uuid;
  inserted_count bigint;
begin
  org_id := public.active_org_id();
  if org_id is null then
    raise exception 'No active org selected' using errcode = '22023';
  end if;

  if not public.is_org_member(org_id) then
    raise exception 'Not a member of org' using errcode = '42501';
  end if;

  role := public.org_role(org_id);
  if role = 'read_only'::public.role_type then
    raise exception 'Insufficient role' using errcode = '42501';
  end if;

  -- Pick an enabled rule, else create a default demo rule.
  select r.id into rule_id
  from public.fraud_rules r
  where r.org_id = org_id
    and r.status = 'enabled'::public.rule_status
  order by r.updated_at desc
  limit 1;

  if rule_id is null then
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
      org_id,
      'Evaluation: International traffic anomaly',
      'Auto-created rule to support demo evaluation.',
      'enabled'::public.rule_status,
      'high'::public.severity,
      15,
      'destination_country',
      jsonb_build_object('thresholds', jsonb_build_array(jsonb_build_object('metric','call_count','op','>=','value',500))),
      60,
      auth.uid(),
      auth.uid()
    )
    returning id into rule_id;
  end if;

  -- Ensure a rule version exists (latest version)
  select v.id into rule_version_id
  from public.fraud_rule_versions v
  where v.rule_id = rule_id
  order by v.version desc
  limit 1;

  if rule_version_id is null then
    insert into public.fraud_rule_versions (org_id, rule_id, version, snapshot, created_by_user_id)
    values (org_id, rule_id, 1, jsonb_build_object('seed',true,'rule_id',rule_id,'version',1), auth.uid())
    returning id into rule_version_id;
  end if;

  with gs as (select g as n from generate_series(1, 10) g),
  base as (
    select
      n,
      (now() - (random() * interval '4 hours')) as created_at,
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
      org_id as org_id,
      rule_id as rule_id,
      rule_version_id as rule_version_id,
      status,
      severity,
      format(template, case when template like '%Carrier failure spike%' then carrier else dest end) as title,
      encode(extensions.gen_random_bytes(16), 'hex') as dedup_key,
      created_at - interval '15 minutes' as window_start_at,
      created_at as window_end_at,
      case when template like '%Carrier failure spike%' then 'carrier_id' else 'destination_country' end as dimension_type,
      case when template like '%Carrier failure spike%' then carrier else dest end as dimension_value,
      jsonb_build_object('generated_by','run_demo_evaluation','carrier',carrier,'destination',dest) as evidence
    from titles
  )
  insert into public.alerts (
    org_id, rule_id, rule_version_id, status, severity, title, dedup_key,
    window_start_at, window_end_at, dimension_type, dimension_value, evidence,
    acknowledged_at, resolved_at, resolution_type, resolution_reason
  )
  select
    org_id, rule_id, rule_version_id, status, severity, title, dedup_key,
    window_start_at, window_end_at, dimension_type, dimension_value, evidence,
    case when status in ('acknowledged'::public.alert_status, 'resolved'::public.alert_status) then window_end_at + interval '5 minutes' else null end,
    case when status = 'resolved'::public.alert_status then window_end_at + interval '30 minutes' else null end,
    case when status = 'resolved'::public.alert_status then (array['false_positive','mitigated','blocked','confirmed_fraud'])[1 + floor(random() * 4)::int] else null end,
    case when status = 'resolved'::public.alert_status then (array['Auto-blocked route','Carrier notified','Rate limited gateway','Manual review complete'])[1 + floor(random() * 4)::int] else null end
  from final;

  get diagnostics inserted_count = row_count;

  return jsonb_build_object('inserted', inserted_count, 'org_id', org_id);
end;
$$;

grant execute on function public.run_demo_evaluation() to authenticated;

