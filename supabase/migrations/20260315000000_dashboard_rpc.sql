-- TeleGuard Pro: dashboard RPC functions required by frontend
-- Notes:
-- - Uses SECURITY DEFINER as requested.
-- - Scopes data to the user's "primary" org (earliest membership), if available.
-- - Uses existing schema columns: cdr_records.call_start_at, revenue_amount, cost_amount; cases.owner_user_id.

-- 1) dashboard_kpis() -> JSON payload
drop function if exists public.dashboard_kpis();
create function public.dashboard_kpis()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  ),
  cdr as (
    select
      count(*)::bigint as calls,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue,
      coalesce(sum(c.duration_seconds), 0)::bigint as duration,
      coalesce(sum(c.revenue_amount - c.cost_amount), 0)::numeric as margin
    from public.cdr_records c
    where exists (select 1 from current_org o where o.org_id = c.org_id)
  ),
  al as (
    select count(*)::bigint as alerts
    from public.alerts a
    where exists (select 1 from current_org o where o.org_id = a.org_id)
      and a.status::text in ('new', 'open')
  )
  select jsonb_build_object(
    'calls', (select calls from cdr),
    'revenue', (select revenue from cdr),
    'duration', (select duration from cdr),
    'margin', (select margin from cdr),
    'alerts', (select alerts from al)
  );
$$;

grant execute on function public.dashboard_kpis() to authenticated;

-- 2) dashboard_call_volume() -> hourly calls, last 24 hours
drop function if exists public.dashboard_call_volume();
create function public.dashboard_call_volume()
returns table (
  hour timestamptz,
  calls bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    date_trunc('hour', c.call_start_at) as hour,
    count(*)::bigint as calls
  from public.cdr_records c
  where exists (select 1 from current_org o where o.org_id = c.org_id)
    and c.call_start_at > now() - interval '24 hours'
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_call_volume() to authenticated;

-- 3) dashboard_revenue_trend() -> daily revenue, last 14 days
drop function if exists public.dashboard_revenue_trend();
create function public.dashboard_revenue_trend()
returns table (
  day date,
  revenue numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    (date_trunc('day', c.call_start_at))::date as day,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where exists (select 1 from current_org o where o.org_id = c.org_id)
    and c.call_start_at > now() - interval '14 days'
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_revenue_trend() to authenticated;

-- 4) dashboard_top_destinations() -> top 10 destinations by revenue
drop function if exists public.dashboard_top_destinations();
create function public.dashboard_top_destinations()
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
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    c.destination_country,
    count(*)::bigint as calls,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where exists (select 1 from current_org o where o.org_id = c.org_id)
  group by 1
  order by revenue desc nulls last
  limit 10;
$$;

grant execute on function public.dashboard_top_destinations() to authenticated;

-- 5) dashboard_recent_alerts() -> last 20 alerts
drop function if exists public.dashboard_recent_alerts();
drop function if exists public.dashboard_recent_alerts(int);
create function public.dashboard_recent_alerts()
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
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    a.id,
    a.title,
    a.severity,
    a.status,
    a.created_at
  from public.alerts a
  where exists (select 1 from current_org o where o.org_id = a.org_id)
  order by a.created_at desc
  limit 20;
$$;

-- Optional overload used by some clients
create function public.dashboard_recent_alerts(limit_count int)
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
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    a.id,
    a.title,
    a.severity,
    a.status,
    a.created_at
  from public.alerts a
  where exists (select 1 from current_org o where o.org_id = a.org_id)
  order by a.created_at desc
  limit greatest(limit_count, 0);
$$;

grant execute on function public.dashboard_recent_alerts() to authenticated;
grant execute on function public.dashboard_recent_alerts(int) to authenticated;

-- 6) dashboard_recent_cases() -> last 20 cases
drop function if exists public.dashboard_recent_cases();
drop function if exists public.dashboard_recent_cases(int);
create function public.dashboard_recent_cases()
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
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    c.id,
    c.title,
    c.status,
    c.severity,
    c.owner_user_id as owner_id,
    c.updated_at
  from public.cases c
  where exists (select 1 from current_org o where o.org_id = c.org_id)
  order by c.updated_at desc
  limit 20;
$$;

-- Optional overload used by some clients
create function public.dashboard_recent_cases(limit_count int)
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
  with current_org as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select
    c.id,
    c.title,
    c.status,
    c.severity,
    c.owner_user_id as owner_id,
    c.updated_at
  from public.cases c
  where exists (select 1 from current_org o where o.org_id = c.org_id)
  order by c.updated_at desc
  limit greatest(limit_count, 0);
$$;

grant execute on function public.dashboard_recent_cases() to authenticated;
grant execute on function public.dashboard_recent_cases(int) to authenticated;

