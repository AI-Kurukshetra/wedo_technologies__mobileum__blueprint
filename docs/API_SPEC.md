# API Spec — TeleGuard Pro (Next.js Route Handlers + Supabase)

This spec describes the server APIs that the Next.js app exposes. The client (web UI) calls these endpoints; endpoints use Supabase server clients and enforce org/RBAC.

Conventions:

- Base path: `/api`
- Auth: Supabase session cookies (via `@supabase/ssr` pattern) for user-scoped endpoints
- Jobs: protected via `x-job-secret` header
- All responses are JSON unless otherwise noted
- Pagination: `limit` + `cursor` (or `offset`) consistently per endpoint

## 1) Auth & Session

Auth is handled by Supabase. In the app:

- Browser uses Supabase client for login/logout
- Server uses Supabase SSR client to read session and enforce org membership

No custom `/api/auth/*` endpoints are required for MVP beyond optional wrappers.

## 2) Common Types

### 2.1 Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "call_start_at is required",
    "details": { "field": "call_start_at" }
  }
}
```

### 2.2 Pagination

Cursor pagination (recommended for lists):

- Request: `?limit=50&cursor=...`
- Response: `{ "data": [...], "nextCursor": "..." }`

## 3) Organization & Membership

### 3.1 Get Current Context

`GET /api/me`

Response:

```json
{
  "user": { "id": "uuid", "email": "a@b.com" },
  "org": { "id": "uuid", "name": "Acme Telco", "slug": "acme" },
  "membership": { "role": "admin" }
}
```

### 3.2 Invite User (MVP: email-based invite)

`POST /api/orgs/:orgId/invites`

Body:

```json
{ "email": "analyst@acme.com", "role": "analyst" }
```

Behavior:

- Creates membership record (if user exists) or creates a pending invite record (optional table) and sends email.
- If avoiding invite complexity in MVP, implement “admin adds user after they sign up”.

## 4) CDR Imports

### 4.1 Create Import (initiate upload)

`POST /api/cdr/imports`

Body:

```json
{ "originalFilename": "cdr_march.csv" }
```

Response:

```json
{
  "import": { "id": "uuid", "status": "uploaded" },
  "upload": {
    "bucket": "cdr-imports",
    "path": "org/{org_id}/imports/{import_id}/original.csv",
    "signedUrl": "https://..."
  }
}
```

Notes:

- Use a signed upload URL from Supabase Storage.
- Store `storage_object_path` in `cdr_imports`.

### 4.2 Start Ingestion (sync or async)

`POST /api/cdr/imports/:importId/ingest`

Response:

```json
{ "importId": "uuid", "status": "processing" }
```

Behavior:

- Server downloads the CSV from Storage.
- Validates and batch-inserts `cdr_records`.
- Updates `cdr_imports` counts and status to `processed` (or `failed`).

### 4.3 List Imports

`GET /api/cdr/imports?limit=50&cursor=...`

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "processed",
      "originalFilename": "cdr.csv",
      "rowCountTotal": 1000,
      "rowCountOk": 995,
      "rowCountFailed": 5,
      "createdAt": "2026-03-14T00:00:00Z"
    }
  ],
  "nextCursor": null
}
```

### 4.4 Get Import Details

`GET /api/cdr/imports/:importId`

Include error summary and sample errors (optional):

```json
{
  "import": { "id": "uuid", "status": "processed" },
  "errors": [
    { "row": 12, "message": "invalid timestamp", "field": "call_start_at" }
  ]
}
```

## 5) CDR Explorer & Analytics

### 5.1 Query CDR Records

`GET /api/cdr/records?from=...&to=...&accountId=...&destinationCountry=...&limit=200&cursor=...`

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "callStartAt": "2026-03-14T10:00:00Z",
      "durationSeconds": 32,
      "aParty": "+12065550100",
      "bParty": "+447700900123",
      "destinationCountry": "GB",
      "accountId": "ACME-001",
      "revenueAmount": "0.120000"
    }
  ],
  "nextCursor": "..."
}
```

### 5.2 KPI Summary

`GET /api/analytics/kpis?from=...&to=...`

Response:

```json
{
  "kpis": {
    "callCount": 123456,
    "totalDurationSeconds": 987654,
    "totalRevenue": "12345.670000",
    "totalCost": "6789.010000",
    "margin": "5556.660000"
  }
}
```

### 5.3 Time Series

`GET /api/analytics/timeseries?from=...&to=...&interval=hour&metric=callCount`

Response:

```json
{
  "points": [
    { "t": "2026-03-14T10:00:00Z", "v": 1200 },
    { "t": "2026-03-14T11:00:00Z", "v": 1300 }
  ]
}
```

### 5.4 Top-N Breakdown

`GET /api/analytics/top?from=...&to=...&dimension=destinationCountry&metric=callCount&limit=20`

Response:

```json
{
  "rows": [
    { "key": "US", "value": 12000 },
    { "key": "GB", "value": 9000 }
  ]
}
```

## 6) Fraud Rules

### 6.1 List Rules

`GET /api/rules?limit=50&cursor=...`

### 6.2 Create Rule

`POST /api/rules`

Body:

```json
{
  "name": "High international volume",
  "description": "Detect spikes by account",
  "status": "enabled",
  "severity": "high",
  "windowMinutes": 15,
  "dimensionType": "account_id",
  "dedupMinutes": 60,
  "conditions": {
    "filters": [
      { "field": "destination_country", "op": "not_in", "value": ["US"] }
    ],
    "thresholds": [
      { "metric": "call_count", "op": ">=", "value": 200 }
    ],
    "min_sample_size": 50
  }
}
```

Response:

```json
{ "rule": { "id": "uuid", "status": "enabled" } }
```

### 6.3 Update Rule

`PATCH /api/rules/:ruleId`

Notes:

- On update, create a new rule version record (server-side) to preserve history.

### 6.4 Enable/Disable Rule

`POST /api/rules/:ruleId/enable`
`POST /api/rules/:ruleId/disable`

### 6.5 Test Rule (MVP)

`POST /api/rules/:ruleId/test`

Body:

```json
{ "from": "2026-03-14T00:00:00Z", "to": "2026-03-14T06:00:00Z", "limit": 50 }
```

Response:

```json
{
  "matches": [
    {
      "dimensionValue": "ACME-001",
      "stats": { "callCount": 250, "totalDurationSeconds": 10000 },
      "why": ["call_count >= 200", "destination_country not_in [US]"]
    }
  ]
}
```

## 7) Alerts

### 7.1 List Alerts

`GET /api/alerts?status=new&severity=high&assignedTo=me&limit=50&cursor=...`

Response includes evidence snippet:

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "new",
      "severity": "high",
      "title": "High international volume",
      "dimensionType": "account_id",
      "dimensionValue": "ACME-001",
      "windowStartAt": "2026-03-14T10:00:00Z",
      "windowEndAt": "2026-03-14T10:15:00Z",
      "evidence": { "callCount": 250, "topDestinations": ["GB", "NG"] }
    }
  ],
  "nextCursor": null
}
```

### 7.2 Get Alert

`GET /api/alerts/:alertId`

### 7.3 Acknowledge / Assign

`POST /api/alerts/:alertId/acknowledge`

Body:

```json
{ "assignedToUserId": "uuid" }
```

### 7.4 Resolve / Mark False Positive

`POST /api/alerts/:alertId/resolve`

Body:

```json
{ "resolutionType": "resolved", "resolutionReason": "Customer campaign confirmed" }
```

Or:

```json
{ "resolutionType": "false_positive", "resolutionReason": "Known test route" }
```

## 8) Case Management

### 8.1 List Cases

`GET /api/cases?status=open&owner=me&limit=50&cursor=...`

### 8.2 Create Case

`POST /api/cases`

Body:

```json
{
  "title": "ACME-001 suspected fraud",
  "description": "Spike in international calls",
  "severity": "high",
  "ownerUserId": "uuid",
  "alertIds": ["uuid-1", "uuid-2"]
}
```

### 8.3 Update Case (status/outcome/owner)

`PATCH /api/cases/:caseId`

Body:

```json
{ "status": "in_review", "ownerUserId": "uuid" }
```

### 8.4 Add Case Note / Event

`POST /api/cases/:caseId/events`

Body:

```json
{ "eventType": "note", "message": "Contacted carrier for verification" }
```

### 8.5 Attachments (signed upload)

`POST /api/attachments`

Body:

```json
{ "caseId": "uuid", "filename": "evidence.png", "contentType": "image/png" }
```

Response:

```json
{
  "attachment": { "id": "uuid" },
  "upload": { "bucket": "case-attachments", "path": "org/{org_id}/cases/{case_id}/evidence.png", "signedUrl": "https://..." }
}
```

## 9) Admin Settings & Notifications

### 9.1 Get Notification Policy

`GET /api/settings/notifications`

### 9.2 Update Notification Policy

`PUT /api/settings/notifications`

Body:

```json
{ "enabled": true, "minSeverity": "high", "emailRecipients": ["fraud@acme.com"] }
```

## 10) Job Endpoints (Cron)

All job endpoints require header:

- `x-job-secret: <value>`

### 10.1 Evaluate Rules

`POST /api/jobs/evaluate-rules`

Body (optional):

```json
{ "orgId": "uuid" }
```

Response:

```json
{ "evaluatedRules": 12, "createdAlerts": 3, "durationMs": 842 }
```

### 10.2 Build Aggregates

`POST /api/jobs/aggregate`

Body:

```json
{ "scope": "hourly", "from": "2026-03-14T00:00:00Z", "to": "2026-03-14T12:00:00Z" }
```

### 10.3 Send Notifications

`POST /api/jobs/notify`

Response:

```json
{ "sent": 4, "skipped": 10 }
```

## 11) Security Requirements for APIs

- Any endpoint that reads/writes tenant data must:
  - resolve `org_id` from the authenticated user context (not from client input), OR validate membership for provided `orgId`.
  - enforce RBAC for write operations.
- Job endpoints must never accept arbitrary `org_id` without verification (limit to configured orgs, or require service role + secret).
- Never return Supabase service role key to client.

