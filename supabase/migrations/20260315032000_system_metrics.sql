-- TeleGuard Pro: system metrics for observability/admin system-health page

create table if not exists public.system_metrics (
  org_id uuid not null references public.orgs(id) on delete cascade,
  key text not null,
  value numeric not null default 0,
  unit text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

create index if not exists system_metrics_org_id_idx on public.system_metrics (org_id);
create index if not exists system_metrics_recorded_at_idx on public.system_metrics (recorded_at desc);

alter table public.system_metrics enable row level security;

drop policy if exists system_metrics_select_admin on public.system_metrics;
create policy system_metrics_select_admin on public.system_metrics
for select
to authenticated
using (
  public.is_org_member(org_id)
  and public.org_role(org_id) = 'admin'::public.role_type
);

drop policy if exists system_metrics_write_admin on public.system_metrics;
create policy system_metrics_write_admin on public.system_metrics
for all
to authenticated
using (
  public.is_org_member(org_id)
  and public.org_role(org_id) = 'admin'::public.role_type
)
with check (
  public.is_org_member(org_id)
  and public.org_role(org_id) = 'admin'::public.role_type
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_system_metrics_set_updated_at') then
    create trigger trg_system_metrics_set_updated_at
    before update on public.system_metrics
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

