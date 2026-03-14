# TeleGuard Pro — Project Documentation

TeleGuard Pro is an **AI-powered telecom fraud detection and revenue assurance platform** built with **Next.js**, **Supabase**, and **Vercel**.

This `/docs` folder is structured for developers and AI-assisted tools (e.g. Codex, Claude CLI) to implement and extend the product end-to-end.

---

## What's included

| Capability | Description |
|------------|-------------|
| **CDR analytics** | Ingestion, normalization, aggregation, and KPI reporting |
| **Fraud detection** | Configurable rules engine (thresholds, windows, allow/deny lists, geo/time heuristics) |
| **Alerts** | Alert generation, routing, notifications, and SLA tracking |
| **Case management** | Triage, assignments, evidence, notes, outcomes, and audit trail |
| **Analytics dashboard** | Operational and executive views, drill-downs, and exports |
| **Authentication** | Supabase Auth with org-based multi-tenancy and RBAC |

---

## Document map

| Document | Purpose |
|----------|---------|
| [PRD.md](PRD.md) | Product requirements, personas, user stories, acceptance criteria, roadmap |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, data flow, jobs/cron, security, observability |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Postgres schema (Supabase), RLS policies, indexes, enums |
| [API_SPEC.md](API_SPEC.md) | Route handlers, payloads, error codes, pagination, webhooks/events |
| [UI_SCREENS.md](UI_SCREENS.md) | Screen inventory, layouts, states, interactions, component contracts |
| [SEED_DATA.md](SEED_DATA.md) | Demo organization, roles, users, sample CDRs, starter rules, alerts/cases |
| [CODING_PLAN.md](CODING_PLAN.md) | Implementation plan, repo structure, milestones, agent-ready task list |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Supabase + Vercel setup, env vars, migrations, cron, monitoring, runbooks |
| [RULE_ENGINE.md](RULE_ENGINE.md) | Supported rule types, evaluation flow, dedup semantics |
| [TELECOM_DOMAIN_MODEL.md](TELECOM_DOMAIN_MODEL.md) | Telecom entities, relationships, tenant boundaries |
| [DATA_PIPELINE.md](DATA_PIPELINE.md) | Import and stream ingestion, aggregation, downstream analytics |
| [OPERATIONS.md](OPERATIONS.md) | Jobs, runtime operations, scheduling, system health |
| [COMPLIANCE_REPORTING.md](COMPLIANCE_REPORTING.md) | Regulatory/compliance report templates and usage |
| [TELEGUARD_PRO_FLOW.md](TELEGUARD_PRO_FLOW.md) | End-to-end flow: CDR → rules → alerts → cases → analytics (with examples) |

---

## System goals

1. **Detect fraud early** — Minutes to hours, with explainable alerts.
2. **Reduce revenue leakage** — Reconciliation and anomaly identification.
3. **Efficient investigations** — Case management and evidence linkage.
4. **Secure operation** — Least-privilege access, full audit trails, strong multi-tenancy.

---

## Non-goals (initial release)

- Real-time mediation at carrier scale (sub-second inline call blocking).
- Full ML model training pipeline in-product (MVP uses heuristics/rules + optional anomaly scoring).
- Network element integrations beyond basic file/API ingestion.

---

## Recommended build order

1. Database schema + RLS → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
2. Auth + org/RBAC scaffolding → [ARCHITECTURE.md](ARCHITECTURE.md), [API_SPEC.md](API_SPEC.md)
3. CDR ingestion + normalization + aggregates
4. Rules engine + alert generation
5. Case management
6. Dashboard + reporting + exports
7. Notifications + integrations
