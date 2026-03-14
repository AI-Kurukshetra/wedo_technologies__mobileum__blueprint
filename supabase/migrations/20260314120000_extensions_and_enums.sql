-- TeleGuard Pro: extensions + enums

create extension if not exists "pgcrypto";
create extension if not exists "citext";

do $$
begin
  create type public.role_type as enum ('admin', 'manager', 'analyst', 'read_only');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.import_status as enum ('uploaded', 'processing', 'processed', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.rule_status as enum ('draft', 'enabled', 'disabled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.alert_status as enum ('new', 'acknowledged', 'resolved', 'false_positive');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.case_status as enum ('open', 'in_review', 'closed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.severity as enum ('low', 'medium', 'high', 'critical');
exception
  when duplicate_object then null;
end $$;

