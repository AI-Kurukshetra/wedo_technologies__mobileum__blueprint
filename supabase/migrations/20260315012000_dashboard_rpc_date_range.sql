-- TeleGuard Pro: dashboard RPCs with optional date-range filtering
-- These SECURITY DEFINER functions bypass RLS, so membership is enforced via is_org_member(org_id).

-- KPI rollup (JSON)
drop function if exists public.dashboard_kpis();
drop function if exists public.dashboard_kpis(timestamptz, timestamptz);
create function public.dashboard_kpis(from_ts timestamptz default null, to_ts timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  ),
  cdr as (
    select
      count(*)::bigint as calls,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue,
      coalesce(sum(c.duration_seconds), 0)::bigint as duration,
      coalesce(sum(c.revenue_amount - c.cost_amount), 0)::numeric as margin
    from public.cdr_records c
    where c.org_id = (select org_id from org_ctx)
      and public.is_org_member(c.org_id)
      and (from_ts is null or c.call_start_at >= from_ts)
      and (to_ts is null or c.call_start_at <= to_ts)
  ),
  al as (
    select count(*)::bigint as alerts
    from public.alerts a
    where a.org_id = (select org_id from org_ctx)
      and public.is_org_member(a.org_id)
      and a.status in ('new'::public.alert_status, 'acknowledged'::public.alert_status)
      and (from_ts is null or a.created_at >= from_ts)
      and (to_ts is null or a.created_at <= to_ts)
  )
  select jsonb_build_object(
    'calls', (select calls from cdr),
    'revenue', (select revenue from cdr),
    'duration', (select duration from cdr),
    'margin', (select margin from cdr),
    'alerts', (select alerts from al)
  );
$$;

grant execute on function public.dashboard_kpis(timestamptz, timestamptz) to authenticated;

-- Call volume: grouped by hour (defaults to last 24 hours)
drop function if exists public.dashboard_call_volume();
drop function if exists public.dashboard_call_volume(timestamptz, timestamptz);
create function public.dashboard_call_volume(from_ts timestamptz default null, to_ts timestamptz default null)
returns table (
  hour timestamptz,
  calls bigint
)
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
      coalesce(from_ts, now() - interval '24 hours') as from_ts,
      coalesce(to_ts, now()) as to_ts
  )
  select
    date_trunc('hour', c.call_start_at) as hour,
    count(*)::bigint as calls
  from public.cdr_records c
  where c.org_id = (select org_id from org_ctx)
    and public.is_org_member(c.org_id)
    and c.call_start_at >= (select from_ts from bounds)
    and c.call_start_at <= (select to_ts from bounds)
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_call_volume(timestamptz, timestamptz) to authenticated;

-- Revenue trend: grouped by day (defaults to last 14 days)
drop function if exists public.dashboard_revenue_trend();
drop function if exists public.dashboard_revenue_trend(timestamptz, timestamptz);
create function public.dashboard_revenue_trend(from_ts timestamptz default null, to_ts timestamptz default null)
returns table (
  day date,
  revenue numeric
)
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
  )
  select
    (date_trunc('day', c.call_start_at))::date as day,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where c.org_id = (select org_id from org_ctx)
    and public.is_org_member(c.org_id)
    and c.call_start_at >= (select from_ts from bounds)
    and c.call_start_at <= (select to_ts from bounds)
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_revenue_trend(timestamptz, timestamptz) to authenticated;

-- Top destinations by revenue (optionally date-filtered)
drop function if exists public.dashboard_top_destinations();
drop function if exists public.dashboard_top_destinations(timestamptz, timestamptz);
create function public.dashboard_top_destinations(from_ts timestamptz default null, to_ts timestamptz default null)
returns table (
  destination_country text,
  calls bigint,
  revenue numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  )
  select
    c.destination_country,
    count(*)::bigint as calls,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where c.org_id = (select org_id from org_ctx)
    and public.is_org_member(c.org_id)
    and (from_ts is null or c.call_start_at >= from_ts)
    and (to_ts is null or c.call_start_at <= to_ts)
  group by 1
  order by revenue desc nulls last
  limit 10;
$$;

grant execute on function public.dashboard_top_destinations(timestamptz, timestamptz) to authenticated;

-- Recent alerts (20) (optionally date-filtered by created_at)
drop function if exists public.dashboard_recent_alerts();
drop function if exists public.dashboard_recent_alerts(timestamptz, timestamptz);
create function public.dashboard_recent_alerts(from_ts timestamptz default null, to_ts timestamptz default null)
returns table (
  id uuid,
  title text,
  severity public.severity,
  status public.alert_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  )
  select
    a.id,
    a.title,
    a.severity,
    a.status,
    a.created_at
  from public.alerts a
  where a.org_id = (select org_id from org_ctx)
    and public.is_org_member(a.org_id)
    and (from_ts is null or a.created_at >= from_ts)
    and (to_ts is null or a.created_at <= to_ts)
  order by a.created_at desc
  limit 20;
$$;

grant execute on function public.dashboard_recent_alerts(timestamptz, timestamptz) to authenticated;

-- Recent cases (20) (optionally date-filtered by updated_at)
drop function if exists public.dashboard_recent_cases();
drop function if exists public.dashboard_recent_cases(timestamptz, timestamptz);
create function public.dashboard_recent_cases(from_ts timestamptz default null, to_ts timestamptz default null)
returns table (
  id uuid,
  title text,
  status public.case_status,
  severity public.severity,
  owner_id uuid,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  )
  select
    c.id,
    c.title,
    c.status,
    c.severity,
    c.owner_user_id as owner_id,
    c.updated_at
  from public.cases c
  where c.org_id = (select org_id from org_ctx)
    and public.is_org_member(c.org_id)
    and (from_ts is null or c.updated_at >= from_ts)
    and (to_ts is null or c.updated_at <= to_ts)
  order by c.updated_at desc
  limit 20;
$$;

grant execute on function public.dashboard_recent_cases(timestamptz, timestamptz) to authenticated;

-- Alerts by severity (open) (optionally date-filtered by created_at)
drop function if exists public.dashboard_alerts_by_severity_open();
drop function if exists public.dashboard_alerts_by_severity_open(timestamptz, timestamptz);
create function public.dashboard_alerts_by_severity_open(from_ts timestamptz default null, to_ts timestamptz default null)
returns table (
  severity public.severity,
  count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with org_ctx as (
    select public.active_org_id() as org_id
  )
  select
    a.severity,
    count(*)::bigint as count
  from public.alerts a
  where a.org_id = (select org_id from org_ctx)
    and public.is_org_member(a.org_id)
    and a.status in ('new'::public.alert_status, 'acknowledged'::public.alert_status)
    and (from_ts is null or a.created_at >= from_ts)
    and (to_ts is null or a.created_at <= to_ts)
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_alerts_by_severity_open(timestamptz, timestamptz) to authenticated;

-- Compatibility aliases (no-arg variants keep old behavior)
drop function if exists public.dashboard_call_volume_24h();
create function public.dashboard_call_volume_24h()
returns table (hour timestamptz, calls bigint)
language sql
stable
security definer
set search_path = public, auth
as $$ select * from public.dashboard_call_volume(null, null); $$;
grant execute on function public.dashboard_call_volume_24h() to authenticated;

drop function if exists public.dashboard_revenue_trend_14d();
create function public.dashboard_revenue_trend_14d()
returns table (day date, revenue numeric)
language sql
stable
security definer
set search_path = public, auth
as $$ select * from public.dashboard_revenue_trend(null, null); $$;
grant execute on function public.dashboard_revenue_trend_14d() to authenticated;

