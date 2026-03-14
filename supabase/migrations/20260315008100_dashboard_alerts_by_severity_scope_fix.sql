-- TeleGuard Pro: dashboard alerts-by-severity RPC (scoped to member orgs)

drop function if exists public.dashboard_alerts_by_severity_open();
create function public.dashboard_alerts_by_severity_open()
returns table (
  severity public.severity,
  count bigint
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
    a.severity,
    count(*)::bigint as count
  from public.alerts a
  where a.org_id in (select org_id from member_orgs)
    and a.status in ('new'::public.alert_status, 'acknowledged'::public.alert_status)
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_alerts_by_severity_open() to authenticated;

