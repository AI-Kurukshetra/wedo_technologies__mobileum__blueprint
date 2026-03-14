-- TeleGuard Pro: dashboard RPC scoping fix
-- SECURITY DEFINER functions must manually enforce org membership because they bypass RLS.
-- This revision scopes results to orgs where the caller is a member (auth.uid()).

-- KPI rollup (JSON)
drop function if exists public.dashboard_kpis();
create function public.dashboard_kpis()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with member_orgs as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
  ),
  cdr as (
    select
      count(*)::bigint as calls,
      coalesce(sum(c.revenue_amount), 0)::numeric as revenue,
      coalesce(sum(c.duration_seconds), 0)::bigint as duration,
      coalesce(sum(c.revenue_amount - c.cost_amount), 0)::numeric as margin
    from public.cdr_records c
    where c.org_id in (select org_id from member_orgs)
  ),
  al as (
    -- Schema has alert_status enum: new/acknowledged/resolved/false_positive.
    -- Treat "open" as new+acknowledged.
    select count(*)::bigint as alerts
    from public.alerts a
    where a.org_id in (select org_id from member_orgs)
      and a.status in ('new'::public.alert_status, 'acknowledged'::public.alert_status)
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

-- Call volume: last 24 hours grouped by hour
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
  with member_orgs as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
  )
  select
    date_trunc('hour', c.call_start_at) as hour,
    count(*)::bigint as calls
  from public.cdr_records c
  where c.org_id in (select org_id from member_orgs)
    and c.call_start_at > now() - interval '24 hours'
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_call_volume() to authenticated;

-- Revenue trend: last 14 days grouped by day
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
  with member_orgs as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
  )
  select
    (date_trunc('day', c.call_start_at))::date as day,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where c.org_id in (select org_id from member_orgs)
    and c.call_start_at > now() - interval '14 days'
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_revenue_trend() to authenticated;

-- Top destinations by revenue
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
  with member_orgs as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
  )
  select
    c.destination_country,
    count(*)::bigint as calls,
    coalesce(sum(c.revenue_amount), 0)::numeric as revenue
  from public.cdr_records c
  where c.org_id in (select org_id from member_orgs)
  group by 1
  order by revenue desc nulls last
  limit 10;
$$;

grant execute on function public.dashboard_top_destinations() to authenticated;

-- Recent alerts (20)
drop function if exists public.dashboard_recent_alerts();
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
  with member_orgs as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
  )
  select
    a.id,
    a.title,
    a.severity,
    a.status,
    a.created_at
  from public.alerts a
  where a.org_id in (select org_id from member_orgs)
  order by a.created_at desc
  limit 20;
$$;

grant execute on function public.dashboard_recent_alerts() to authenticated;

-- Recent cases (20)
drop function if exists public.dashboard_recent_cases();
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
  with member_orgs as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
  )
  select
    c.id,
    c.title,
    c.status,
    c.severity,
    c.owner_user_id as owner_id,
    c.updated_at
  from public.cases c
  where c.org_id in (select org_id from member_orgs)
  order by c.updated_at desc
  limit 20;
$$;

grant execute on function public.dashboard_recent_cases() to authenticated;

-- Compatibility aliases (older frontend calls)
drop function if exists public.dashboard_call_volume_24h();
create function public.dashboard_call_volume_24h()
returns table (hour timestamptz, calls bigint)
language sql
stable
security definer
set search_path = public, auth
as $$ select * from public.dashboard_call_volume(); $$;
grant execute on function public.dashboard_call_volume_24h() to authenticated;

drop function if exists public.dashboard_revenue_trend_14d();
create function public.dashboard_revenue_trend_14d()
returns table (day date, revenue numeric)
language sql
stable
security definer
set search_path = public, auth
as $$ select * from public.dashboard_revenue_trend(); $$;
grant execute on function public.dashboard_revenue_trend_14d() to authenticated;

