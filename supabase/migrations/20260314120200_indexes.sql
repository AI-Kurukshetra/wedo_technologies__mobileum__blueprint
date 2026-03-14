-- TeleGuard Pro: indexes

-- orgs
create unique index if not exists orgs_slug_uq on public.orgs (slug);

-- audit log
create index if not exists audit_log_org_created_at_idx on public.audit_log (org_id, created_at desc);
create index if not exists audit_log_org_entity_idx on public.audit_log (org_id, entity_type, entity_id);

-- cdr_imports
create index if not exists cdr_imports_org_created_at_idx on public.cdr_imports (org_id, created_at desc);
create index if not exists cdr_imports_org_status_idx on public.cdr_imports (org_id, status);

-- cdr_records
create index if not exists cdr_records_org_call_start_at_idx on public.cdr_records (org_id, call_start_at desc);
create index if not exists cdr_records_org_account_call_start_at_idx on public.cdr_records (org_id, account_id, call_start_at desc);
create index if not exists cdr_records_org_carrier_call_start_at_idx on public.cdr_records (org_id, carrier_id, call_start_at desc);
create index if not exists cdr_records_org_dest_country_call_start_at_idx on public.cdr_records (org_id, destination_country, call_start_at desc);

-- aggregates
create index if not exists cdr_agg_hourly_org_bucket_idx on public.cdr_aggregates_hourly (org_id, bucket_start_at desc);
create index if not exists cdr_agg_hourly_org_dim_bucket_idx on public.cdr_aggregates_hourly (org_id, dimension_type, bucket_start_at desc);

create index if not exists cdr_agg_daily_org_bucket_idx on public.cdr_aggregates_daily (org_id, bucket_start_at desc);
create index if not exists cdr_agg_daily_org_dim_bucket_idx on public.cdr_aggregates_daily (org_id, dimension_type, bucket_start_at desc);

-- fraud_rules
create index if not exists fraud_rules_org_status_idx on public.fraud_rules (org_id, status);

-- alerts
create index if not exists alerts_org_created_at_idx on public.alerts (org_id, created_at desc);
create index if not exists alerts_org_status_created_at_idx on public.alerts (org_id, status, created_at desc);
create index if not exists alerts_org_assigned_status_idx on public.alerts (org_id, assigned_to_user_id, status);

-- cases
create index if not exists cases_org_status_updated_at_idx on public.cases (org_id, status, updated_at desc);
create index if not exists cases_org_owner_status_idx on public.cases (org_id, owner_user_id, status);

-- case events
create index if not exists case_events_org_case_created_at_idx on public.case_events (org_id, case_id, created_at asc);

