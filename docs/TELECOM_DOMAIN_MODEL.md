# TeleGuard Pro — Telecom Domain Model

TeleGuard Pro is multi-tenant. All telecom domain tables are scoped by `org_id` and protected by RLS.

## Tenant isolation

All domain tables include:

- `org_id uuid references orgs(id)`
- `created_at`, `updated_at`

RLS policies follow the pattern:

- Members of `org_memberships` can `SELECT`
- Write access is restricted by API-level RBAC (admin/manager/analyst) and/or policies (where configured)

Active org selection:

- Stored in `active_orgs` (per-user)
- Server/API routes resolve with `getActiveOrgIdForUser(...)`

## Entities

### Subscribers (`subscribers`)

Represents end-customer SIM/subscriber identity.

Key fields:

- `msisdn` (indexed)
- `imsi`, `imei`
- `status`, `metadata`

Typical usage:

- Correlate alerts/cases to subscriber identity during investigations.

### Networks (`networks`)

Represents operator or roaming partner network descriptors.

Key fields:

- `mcc`, `mnc`, `country_code`, `network_code`
- `metadata`

### Services (`services`)

Represents product/service categories (voice/SMS/data/etc).

Key fields:

- `service_type`
- `metadata`

### Tariffs (`tariffs`)

Represents rating/pricing rules used for revenue assurance analysis.

Key fields:

- `currency`, `effective_from`, `effective_to`
- `rates` (JSON)

### Partners (`partners`)

Represents carriers/interconnect partners.

Key fields:

- `partner_type`
- `country_code`
- `contact_email`, `contact_phone`
- `metadata`

### Agreements (`agreements`)

Represents contractual agreements with partners.

Key fields:

- `partner_id`
- `agreement_type`
- `terms` (JSON)

### Settlements (`settlements`)

Represents interconnect settlement periods.

Key fields:

- `partner_id`, `agreement_id`
- `period_start`, `period_end`
- `amount_due`, `amount_paid`
- `status`

Used by:

- `/analytics/interconnect` (variance monitoring)

### Reconciliations (`reconciliations`)

Represents reconciliation runs across systems (A vs B).

Key fields:

- `source_a`, `source_b`
- `summary` (JSON)

### Reports (`reports`)

Represents generated report runs and/or scheduled report definitions.

In this codebase:

- `/reports` creates a new row per generated report and stores file metadata in `reports.metadata`.

## APIs (minimal CRUD)

Implemented APIs (org-scoped):

- Subscribers: `app/api/subscribers/*`
- Networks: `app/api/networks/*`
- Partners: `app/api/partners/*`

Note:

- Detail pages exist for `/subscribers/[id]` and `/partners/[id]` to support global search navigation.

