-- TeleGuard Pro: dashboard RPC functions (avoid PostgREST aggregates limitation)

-- KPI rollup (scoped by RLS to the current user/org memberships)
create or replace function public.dashboard_kpis()
returns table (
  calls bigint,
  revenue numeric,
  duration_seconds bigint,
  margin numeric,
  open_alerts bigint
)
language sql
stable
set search_path = public, auth
as $$
  with cdr as (
    select
      count(*)::bigint as calls,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue,
      coalesce(sum(c.duration_seconds), 0)::bigint as duration_seconds,
      coalesce(sum(c.cost_amount), 0)::numeric as cost
    from public.cdr_records c
  ),
  a as (
    select count(*)::bigint as open_alerts
    from public.alerts al
    where al.status in ('new', 'acknowledged')
  )
  select
    cdr.calls,
    cdr.revenue,
    cdr.duration_seconds,
    (cdr.revenue - cdr.cost)::numeric as margin,
    a.open_alerts
  from cdr cross join a;
$$;

grant execute on function public.dashboard_kpis() to authenticated;

-- Call volume: last 24 hours grouped by hour
create or replace function public.dashboard_call_volume_24h()
returns table (
  hour timestamptz,
  calls bigint
)
language sql
stable
set search_path = public, auth
as $$
  select
    date_trunc('hour', c.call_start_at) as hour,
    count(*)::bigint as calls
  from public.cdr_records c
  where c.call_start_at > now() - interval '24 hours'
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_call_volume_24h() to authenticated;

-- Revenue trend: last 14 days grouped by day
create or replace function public.dashboard_revenue_trend_14d()
returns table (
  day date,
  revenue numeric
)
language sql
stable
set search_path = public, auth
as $$
  select
    (date_trunc('day', c.call_start_at))::date as day,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where c.call_start_at > now() - interval '14 days'
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_revenue_trend_14d() to authenticated;

-- Alerts by severity (open)
create or replace function public.dashboard_alerts_by_severity_open()
returns table (
  severity public.severity,
  count bigint
)
language sql
stable
set search_path = public, auth
as $$
  select
    al.severity,
    count(*)::bigint as count
  from public.alerts al
  where al.status in ('new', 'acknowledged')
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_alerts_by_severity_open() to authenticated;

-- Top destinations (revenue) - limit 10
create or replace function public.dashboard_top_destinations()
returns table (
  destination_country text,
  calls bigint,
  revenue numeric
)
language sql
stable
set search_path = public, auth
as $$
  select
    c.destination_country,
    count(*)::bigint as calls,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  group by 1
  order by revenue desc nulls last
  limit 10;
$$;

grant execute on function public.dashboard_top_destinations() to authenticated;

-- Recent alerts (limit 20)
create or replace function public.dashboard_recent_alerts(limit_count int default 20)
returns table (
  id uuid,
  title text,
  severity public.severity,
  status public.alert_status,
  created_at timestamptz,
  assigned_to_user_id uuid
)
language sql
stable
set search_path = public, auth
as $$
  select
    al.id,
    al.title,
    al.severity,
    al.status,
    al.created_at,
    al.assigned_to_user_id
  from public.alerts al
  order by al.created_at desc
  limit greatest(limit_count, 0);
$$;

grant execute on function public.dashboard_recent_alerts(int) to authenticated;

-- Recent cases (limit 20)
create or replace function public.dashboard_recent_cases(limit_count int default 20)
returns table (
  id uuid,
  title text,
  status public.case_status,
  severity public.severity,
  owner_user_id uuid,
  updated_at timestamptz
)
language sql
stable
set search_path = public, auth
as $$
  select
    c.id,
    c.title,
    c.status,
    c.severity,
    c.owner_user_id,
    c.updated_at
  from public.cases c
  order by c.updated_at desc
  limit greatest(limit_count, 0);
$$;

grant execute on function public.dashboard_recent_cases(int) to authenticated;
