-- TeleGuard Pro: real-time pipeline event outbox + webhook notifications
-- Adds:
-- - pipeline_events queue with safe claiming RPC (SKIP LOCKED)
-- - webhook endpoints for notification policies
-- - notification_deliveries for idempotent delivery + retry safety

-- 1) Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pipeline_event_status') then
    create type public.pipeline_event_status as enum ('pending', 'processing', 'processed', 'failed', 'dead_lettered');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type public.delivery_status as enum ('pending', 'success', 'failed');
  end if;
end $$;

-- 2) Notification policies: webhook endpoints
alter table public.notification_policies
  add column if not exists webhook_urls text[] not null default '{}'::text[];

create index if not exists notification_policies_org_webhooks_idx on public.notification_policies (org_id);

-- 3) Pipeline events (outbox/queue)
create table if not exists public.pipeline_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  event_type text not null,
  status public.pipeline_event_status not null default 'pending',
  dedup_key text not null,
  payload jsonb not null default '{}'::jsonb,
  attempt_count int not null default 0,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz,
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipeline_events_org_dedup_unique unique (org_id, event_type, dedup_key)
);

create index if not exists pipeline_events_org_status_idx on public.pipeline_events (org_id, status, created_at desc);
create index if not exists pipeline_events_org_next_attempt_idx on public.pipeline_events (org_id, next_attempt_at, created_at asc);
create index if not exists pipeline_events_locked_idx on public.pipeline_events (locked_at);

alter table public.pipeline_events enable row level security;

drop policy if exists pipeline_events_select on public.pipeline_events;
create policy pipeline_events_select on public.pipeline_events
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists pipeline_events_insert on public.pipeline_events;
create policy pipeline_events_insert on public.pipeline_events
for insert to authenticated
with check (public.org_role(org_id) in ('admin', 'manager', 'analyst'));

drop policy if exists pipeline_events_update on public.pipeline_events;
create policy pipeline_events_update on public.pipeline_events
for update to authenticated
using (public.org_role(org_id) in ('admin', 'manager'))
with check (public.org_role(org_id) in ('admin', 'manager'));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pipeline_events_set_updated_at') then
    create trigger trg_pipeline_events_set_updated_at
    before update on public.pipeline_events
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- 3.1) Claim RPC (safe multi-worker processing)
drop function if exists public.pipeline_claim_events(uuid, int, text);
create function public.pipeline_claim_events(p_org_id uuid, p_limit int default 25, p_worker text default 'worker')
returns setof public.pipeline_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.pipeline_events
    where org_id = p_org_id
      and status in ('pending'::public.pipeline_event_status, 'failed'::public.pipeline_event_status)
      and (next_attempt_at is null or next_attempt_at <= now())
      and (
        locked_at is null
        or locked_at < now() - interval '10 minutes'
      )
      and status <> 'dead_lettered'::public.pipeline_event_status
    order by created_at asc
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  ),
  upd as (
    update public.pipeline_events e
      set status = 'processing'::public.pipeline_event_status,
          locked_at = now(),
          locked_by = p_worker,
          updated_at = now()
    from candidates c
    where e.id = c.id
    returning e.*
  )
  select * from upd;
end $$;

grant execute on function public.pipeline_claim_events(uuid, int, text) to service_role;

-- 4) Notification deliveries (idempotent per target)
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  channel text not null default 'webhook',
  target text not null,
  status public.delivery_status not null default 'pending',
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_unique unique (org_id, alert_id, channel, target)
);

create index if not exists notification_deliveries_org_alert_idx on public.notification_deliveries (org_id, alert_id);
create index if not exists notification_deliveries_org_status_idx on public.notification_deliveries (org_id, status, updated_at desc);

alter table public.notification_deliveries enable row level security;

drop policy if exists notification_deliveries_select on public.notification_deliveries;
create policy notification_deliveries_select on public.notification_deliveries
for select to authenticated
using (public.is_org_member(org_id));

drop policy if exists notification_deliveries_write on public.notification_deliveries;
create policy notification_deliveries_write on public.notification_deliveries
for all to authenticated
using (public.org_role(org_id) = 'admin'::public.role_type)
with check (public.org_role(org_id) = 'admin'::public.role_type);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_notification_deliveries_set_updated_at') then
    create trigger trg_notification_deliveries_set_updated_at
    before update on public.notification_deliveries
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

