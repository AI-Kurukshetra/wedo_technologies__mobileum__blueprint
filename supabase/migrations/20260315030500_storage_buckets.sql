-- TeleGuard Pro: required Storage buckets (case attachments, reports)
-- Supabase Storage tables live in the `storage` schema. This migration is safe to apply multiple times.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('case-attachments', 'case-attachments', false)
    on conflict (id) do nothing;

    insert into storage.buckets (id, name, public)
    values ('reports', 'reports', false)
    on conflict (id) do nothing;
  end if;
end $$;

