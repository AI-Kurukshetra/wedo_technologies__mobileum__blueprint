-- TeleGuard Pro: analytics RPCs for /analytics pages (active org scoped)
-- SECURITY DEFINER functions bypass RLS, so membership is enforced via public.is_org_member() + active_org_id().

-- Revenue leakage: daily revenue/cost/margin + negative margin leakage
drop function if exists public.analytics_revenue_leakage(timestamptz, timestamptz);
create function public.analytics_revenue_leakage(from_ts timestamptz default null, to_ts timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  ),
  bounds as (
    select
      coalesce(from_ts, now() - interval '14 days') as from_ts,
      coalesce(to_ts, now()) as to_ts
  ),
  series as (
    select
      (date_trunc('day', c.call_start_at))::date as day,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue,
      coalesce(sum(c.cost_amount), 0)::numeric as cost,
      coalesce(sum(c.revenue_amount - c.cost_amount), 0)::numeric as margin
    from public.cdr_records c
    where c.org_id = (select org_id from org_ctx)
      and public.is_org_member(c.org_id)
      and c.call_start_at >= (select from_ts from bounds)
      and c.call_start_at <= (select to_ts from bounds)
    group by 1
    order by 1
  )
  select jsonb_build_object(
    'series',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'day', s.day,
          'revenue', s.revenue,
          'cost', s.cost,
          'margin', s.margin,
          'leakage', greatest(s.cost - s.revenue, 0),
          'marginPct', case when s.revenue = 0 then 0 else round((s.margin / s.revenue) * 100, 2) end
        )
      ),
      '[]'::jsonb
    )
  )
  from series s;
$$;

grant execute on function public.analytics_revenue_leakage(timestamptz, timestamptz) to authenticated;

-- Roaming/international activity: daily international calls + top international destinations
drop function if exists public.analytics_roaming_activity(timestamptz, timestamptz);
create function public.analytics_roaming_activity(from_ts timestamptz default null, to_ts timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  ),
  bounds as (
    select
      coalesce(from_ts, now() - interval '14 days') as from_ts,
      coalesce(to_ts, now()) as to_ts
  ),
  daily as (
    select
      (date_trunc('day', c.call_start_at))::date as day,
      count(*)::bigint as calls,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue
    from public.cdr_records c
    where c.org_id = (select org_id from org_ctx)
      and public.is_org_member(c.org_id)
      and c.call_start_at >= (select from_ts from bounds)
      and c.call_start_at <= (select to_ts from bounds)
      and coalesce(c.destination_country, '') <> ''
      and c.destination_country <> 'US'
    group by 1
    order by 1
  ),
  top_countries as (
    select
      c.destination_country as country,
      count(*)::bigint as calls,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue,
      round(avg(c.duration_seconds)::numeric, 2) as avg_duration_seconds
    from public.cdr_records c
    where c.org_id = (select org_id from org_ctx)
      and public.is_org_member(c.org_id)
      and c.call_start_at >= (select from_ts from bounds)
      and c.call_start_at <= (select to_ts from bounds)
      and coalesce(c.destination_country, '') <> ''
      and c.destination_country <> 'US'
    group by 1
    order by revenue desc nulls last
    limit 10
  )
  select jsonb_build_object(
    'internationalDaily',
    coalesce(
      (select jsonb_agg(jsonb_build_object('day', d.day, 'calls', d.calls, 'revenue', d.revenue)) from daily d),
      '[]'::jsonb
    ),
    'topCountries',
    coalesce(
      (select jsonb_agg(jsonb_build_object('country', t.country, 'calls', t.calls, 'revenue', t.revenue, 'avgDurationSeconds', t.avg_duration_seconds)) from top_countries t),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.analytics_roaming_activity(timestamptz, timestamptz) to authenticated;

-- Interconnect: settlement variance and partner rollups
drop function if exists public.analytics_interconnect_variance(date, date);
create function public.analytics_interconnect_variance(from_date date default null, to_date date default null)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  ),
  bounds as (
    select
      coalesce(from_date, (now() - interval '90 days')::date) as from_date,
      coalesce(to_date, now()::date) as to_date
  ),
  rollup as (
    select
      s.partner_id,
      coalesce(p.name, 'Unknown partner') as partner_name,
      coalesce(sum(s.amount_due), 0)::numeric as amount_due,
      coalesce(sum(s.amount_paid), 0)::numeric as amount_paid,
      coalesce(sum(s.amount_due - s.amount_paid), 0)::numeric as variance
    from public.settlements s
    left join public.partners p on p.id = s.partner_id
    where s.org_id = (select org_id from org_ctx)
      and public.is_org_member(s.org_id)
      and s.period_end >= (select from_date from bounds)
      and s.period_start <= (select to_date from bounds)
    group by 1, 2
    order by variance desc nulls last
    limit 20
  ),
  by_period as (
    select
      s.period_start,
      coalesce(sum(s.amount_due - s.amount_paid), 0)::numeric as variance
    from public.settlements s
    where s.org_id = (select org_id from org_ctx)
      and public.is_org_member(s.org_id)
      and s.period_end >= (select from_date from bounds)
      and s.period_start <= (select to_date from bounds)
    group by 1
    order by 1
  )
  select jsonb_build_object(
    'partnerVariance',
    coalesce(
      (select jsonb_agg(jsonb_build_object('partnerId', r.partner_id, 'partnerName', r.partner_name, 'amountDue', r.amount_due, 'amountPaid', r.amount_paid, 'variance', r.variance)) from rollup r),
      '[]'::jsonb
    ),
    'varianceByPeriod',
    coalesce(
      (select jsonb_agg(jsonb_build_object('periodStart', b.period_start, 'variance', b.variance)) from by_period b),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.analytics_interconnect_variance(date, date) to authenticated;

-- Fraud patterns: alerts by severity, top dimensions, daily trend
drop function if exists public.analytics_fraud_patterns(timestamptz, timestamptz);
create function public.analytics_fraud_patterns(from_ts timestamptz default null, to_ts timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  ),
  bounds as (
    select
      coalesce(from_ts, now() - interval '14 days') as from_ts,
      coalesce(to_ts, now()) as to_ts
  ),
  sev as (
    select a.severity, count(*)::bigint as count
    from public.alerts a
    where a.org_id = (select org_id from org_ctx)
      and public.is_org_member(a.org_id)
      and a.created_at >= (select from_ts from bounds)
      and a.created_at <= (select to_ts from bounds)
      and a.status in ('new'::public.alert_status, 'acknowledged'::public.alert_status)
    group by 1
    order by 1
  ),
  dims as (
    select
      a.dimension_type,
      a.dimension_value,
      count(*)::bigint as count
    from public.alerts a
    where a.org_id = (select org_id from org_ctx)
      and public.is_org_member(a.org_id)
      and a.created_at >= (select from_ts from bounds)
      and a.created_at <= (select to_ts from bounds)
    group by 1, 2
    order by count desc
    limit 15
  ),
  daily as (
    select
      (date_trunc('day', a.created_at))::date as day,
      count(*)::bigint as alerts
    from public.alerts a
    where a.org_id = (select org_id from org_ctx)
      and public.is_org_member(a.org_id)
      and a.created_at >= (select from_ts from bounds)
      and a.created_at <= (select to_ts from bounds)
    group by 1
    order by 1
  )
  select jsonb_build_object(
    'alertsBySeverity',
    coalesce((select jsonb_agg(jsonb_build_object('severity', s.severity, 'count', s.count)) from sev s), '[]'::jsonb),
    'topDimensions',
    coalesce((select jsonb_agg(jsonb_build_object('dimensionType', d.dimension_type, 'dimensionValue', d.dimension_value, 'count', d.count)) from dims d), '[]'::jsonb),
    'trend',
    coalesce((select jsonb_agg(jsonb_build_object('day', t.day, 'alerts', t.alerts)) from daily t), '[]'::jsonb)
  );
$$;

grant execute on function public.analytics_fraud_patterns(timestamptz, timestamptz) to authenticated;

