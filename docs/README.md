# TeleGuard Pro — Project Documentation

TeleGuard Pro is an **AI-powered telecom fraud detection and revenue assurance platform** built with **Next.js**, **Supabase**, and **Vercel**.

This `/docs` folder is written to be directly usable by AI-assisted coding tools (Codex/Claude CLI) to implement the product end-to-end.

## What’s Included

- **CDR analytics**: ingestion, normalization, aggregation, and KPI reporting.
- **Fraud detection rules**: configurable rules engine (thresholds, windows, allow/deny lists, geo/time heuristics).
- **Alerts system**: alert generation, routing, notifications, and SLA tracking.
- **Case management**: triage, assignments, evidence, notes, outcomes, and audit trail.
- **Analytics dashboard**: operational + executive views, drill-downs, and exports.
- **Authentication**: Supabase Auth with org-based multi-tenancy and RBAC.

## Document Map

- `docs/PRD.md` — Product requirements, personas, user stories, acceptance criteria, roadmap.
- `docs/ARCHITECTURE.md` — System design, components, data flow, jobs/cron, security, observability.
- `docs/DATABASE_SCHEMA.md` — Postgres schema (Supabase), RLS policies, indexes, enums.
- `docs/API_SPEC.md` — Route handlers, payloads, error codes, pagination, webhooks/events.
- `docs/UI_SCREENS.md` — Screen inventory, layouts, states, interactions, component contracts.
- `docs/SEED_DATA.md` — Demo organization, roles, users, sample CDRs, starter rules, sample alerts/cases.
- `docs/CODING_PLAN.md` — Implementation plan, repo structure, milestones, “agent-ready” task list.
- `docs/DEPLOYMENT.md` — Supabase + Vercel setup, env vars, migrations, cron, monitoring, runbooks.
- `docs/RULE_ENGINE.md` — Supported rule types, evaluation flow, dedup semantics.
- `docs/TELECOM_DOMAIN_MODEL.md` — Telecom entities, relationships, tenant boundaries.
- `docs/DATA_PIPELINE.md` — Import + stream ingestion, aggregation, and downstream analytics flow.
- `docs/OPERATIONS.md` — Jobs, runtime operations, scheduling, and system-health notes.
- `docs/COMPLIANCE_REPORTING.md` — Regulatory/compliance report templates and usage.

## System Goals (High-Level)

1. **Detect fraud early** (minutes to hours) with explainable alerts.
2. **Reduce revenue leakage** through reconciliation and anomaly identification.
3. **Make investigations efficient** with case management + evidence linkage.
4. **Operate securely** with least-privilege access, full audit trails, and strong multi-tenancy.

## Non-Goals (Initial Release)

- Real-time mediation at carrier scale (sub-second inline call blocking).
- Full ML model training pipeline in-product (MVP uses heuristics/rules + optional anomaly scoring).
- Network element integrations beyond basic file/API ingestion.

## Recommended Build Order

1. Database schema + RLS (`docs/DATABASE_SCHEMA.md`)
2. Auth + org/RBAC scaffolding (`docs/ARCHITECTURE.md`, `docs/API_SPEC.md`)
3. CDR ingestion + normalization + aggregates
4. Rules engine + alert generation
5. Case management
6. Dashboard + reporting + exports
7. Notifications + integrations

