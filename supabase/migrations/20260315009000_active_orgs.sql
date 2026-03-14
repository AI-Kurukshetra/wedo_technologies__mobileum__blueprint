-- TeleGuard Pro: active organization selection per user

create table if not exists public.active_orgs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.active_orgs enable row level security;

drop policy if exists active_orgs_select on public.active_orgs;
create policy active_orgs_select on public.active_orgs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists active_orgs_upsert on public.active_orgs;
create policy active_orgs_upsert on public.active_orgs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_org_member(org_id)
);

drop policy if exists active_orgs_update on public.active_orgs;
create policy active_orgs_update on public.active_orgs
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_org_member(org_id)
);

-- updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_active_orgs_set_updated_at') then
    create trigger trg_active_orgs_set_updated_at
    before update on public.active_orgs
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- Helper: returns the active org for current user, else first membership org.
drop function if exists public.active_org_id();
create function public.active_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  with chosen as (
    select ao.org_id
    from public.active_orgs ao
    where ao.user_id = auth.uid()
      and exists (
        select 1 from public.org_memberships m
        where m.user_id = auth.uid()
          and m.org_id = ao.org_id
      )
    limit 1
  ),
  fallback as (
    select m.org_id
    from public.org_memberships m
    where m.user_id = auth.uid()
    order by m.created_at asc
    limit 1
  )
  select coalesce((select org_id from chosen), (select org_id from fallback));
$$;

grant execute on function public.active_org_id() to authenticated;

