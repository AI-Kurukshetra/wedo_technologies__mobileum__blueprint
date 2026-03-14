-- TeleGuard Pro: Case workflow upgrades (priority, SLA, resolution notes)
-- Adds columns only; does not remove/modify existing columns.

alter table public.cases
  add column if not exists priority text not null default 'medium',
  add column if not exists sla_deadline timestamptz,
  add column if not exists resolution_notes text;

create index if not exists cases_org_priority_idx on public.cases (org_id, priority);
create index if not exists cases_org_sla_deadline_idx on public.cases (org_id, sla_deadline);

