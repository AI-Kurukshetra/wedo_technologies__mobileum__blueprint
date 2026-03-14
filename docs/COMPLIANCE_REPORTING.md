# TeleGuard Pro — Compliance Reporting

This document describes compliance-oriented report templates available in TeleGuard Pro.

## Report templates

### 1) Regulatory Summary (`regulatory_summary`)

Intended audience:

- Telecom regulator submission teams
- Internal compliance teams

Contents (CSV):

- CDR volume for selected period
- Alert counts and severity/status distribution
- Case counts
- Reconciliation run counts

Endpoints:

- Generate: `POST /api/reports/generate` with `type=regulatory_summary`
- Download: `GET /api/reports/[id]/download`

### 2) Compliance Audit Trail (`compliance_audit`)

Intended audience:

- Internal audit
- External auditors

Contents (CSV):

- Audit log events from `audit_log`
- Action, entity type/id, actor user, timestamp

Endpoints:

- Generate: `POST /api/reports/generate` with `type=compliance_audit`
- Download: `GET /api/reports/[id]/download`

## Report scheduling

Use report schedule API:

- `POST /api/reports/[id]/schedule`

Key fields:

- `scheduleCron` (cron expression or empty to disable)
- `recipients` (email list stored for future distribution workflows)

Execution:

- `scheduledReportsJob` checks scheduled reports and regenerates due outputs.

## Notes

- Reports are tenant-scoped (`org_id`) and protected by RLS.
- Current implementation emits CSV for portability and downstream processing.
