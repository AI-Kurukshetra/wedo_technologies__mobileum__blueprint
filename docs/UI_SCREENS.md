# UI Screens — TeleGuard Pro

This document enumerates screens and their core UX requirements so an AI agent can implement the UI without ambiguity.

## 1) Global UI Patterns

### 1.1 Layout

- Left sidebar navigation (Dashboard, CDR, Rules, Alerts, Cases, Settings)
- Top bar:
  - org switcher (future; MVP single org per user)
  - date range picker (for analytics pages)
  - user menu (profile, logout)

### 1.2 Design System (MVP)

- Use a component library (implementation choice) with:
  - tables with sticky headers, column toggles
  - filter chips
  - modal dialogs
  - toast notifications
  - empty/loading/error states

### 1.3 RBAC UI Rules

- `read_only`:
  - cannot upload CDRs
  - cannot create/edit rules
  - cannot acknowledge/resolve alerts
  - cannot create/update cases
- All role restrictions are also enforced by API/RLS; UI gating is convenience.

## 2) Auth Screens

### 2.1 Login

Route: `/login`

Components:

- email + password fields
- “Forgot password” link (optional)
- submit button (loading state)

States:

- invalid credentials (error banner)
- unverified email (if enabled)

### 2.2 (Optional) Signup

Route: `/signup`

MVP simplification:

- allow signup + create org flow OR require admin invite only

## 3) Onboarding / Org Setup

### 3.1 Create Organization (if enabled)

Route: `/onboarding`

Fields:

- org name
- slug (auto-suggest)

Actions:

- create org + membership as `admin`

## 4) Dashboard

Route: `/dashboard`

Widgets:

- KPI cards: Calls, Duration, Revenue, Cost, Margin
- Alert summary:
  - counts by severity
  - open alerts by status
- Case summary:
  - open cases
  - MTTA/MTTR (if computed)
- Charts:
  - time series (calls, revenue, failed rate)
  - top destinations (table + bar chart)

Interactions:

- date range picker affects all widgets
- clicking a KPI or top destination drills into CDR Explorer filtered
- clicking alert counts opens Alerts list pre-filtered

Empty states:

- “No CDRs ingested yet” CTA to upload

## 5) CDR Module

### 5.1 CDR Imports List

Route: `/cdr/imports`

Table columns:

- created at
- filename
- status
- total rows / ok / failed
- processing duration
- actions: view details, retry (if failed), delete (optional)

Actions:

- “Upload CDR CSV” button → opens upload modal

### 5.2 Upload CDR Modal

Components:

- file picker (CSV)
- mapping preview (optional MVP: fixed template)
- start upload + ingest button
- progress indicator

Behavior:

- create import → signed upload URL → upload → call ingest endpoint
- show success with import summary

Validation UX:

- if rows fail, show:
  - count failed
  - download “error report CSV” (optional)
  - sample error rows in a table

### 5.3 Import Details

Route: `/cdr/imports/:importId`

Sections:

- summary (counts, timestamps)
- errors (table)
- sample normalized rows (optional)

### 5.4 CDR Explorer

Route: `/cdr/explorer`

Filters (left panel or top row):

- date/time range
- account/customer
- carrier/trunk
- destination country
- destination prefix
- direction
- answer status
- min duration
- min revenue

Main content:

- table of CDR rows (virtualized if needed)
- row detail drawer showing full record + raw JSON

Actions:

- export filtered CDRs to CSV (server-generated)

## 6) Rules Module

### 6.1 Rules List

Route: `/rules`

Table columns:

- name
- status (enabled/disabled/draft)
- severity
- window
- dimension
- last updated
- actions: view/edit, enable/disable, test

### 6.2 Rule Builder (Create/Edit)

Route: `/rules/new` and `/rules/:ruleId`

Form sections:

1. Basics: name, description, severity, status
2. Window: last N minutes
3. Dimension: group by (account_id, a_party, destination_country, carrier_id)
4. Filters: include/exclude lists (e.g., countries, prefixes, carriers)
5. Thresholds: metric comparisons
6. Dedup: prevent repeated alerts for X minutes

UX:

- show a “human readable summary” of the rule
- validate configuration before save

### 6.3 Rule Test

In Rule Builder or a modal:

- time range selector (last 6h / 24h / custom)
- results table of matches:
  - dimension value
  - stats
  - why triggered

## 7) Alerts Module

### 7.1 Alerts List

Route: `/alerts`

Filters:

- status
- severity
- rule
- assigned to (me/unassigned/user)
- date range
- dimension type/value search

Table columns:

- created at
- severity
- status
- rule name/title
- dimension value
- window
- assigned to

Row click opens Alert Detail.

Bulk actions (optional MVP):

- acknowledge selected
- assign selected

### 7.2 Alert Detail

Route: `/alerts/:alertId`

Header:

- title, severity, status, assignment, window

Tabs/sections:

- Evidence:
  - trigger stats (call count, duration, revenue, failed rate)
  - top destinations / contributors
- Related CDRs:
  - a filtered CDR table (server query based on alert context)
- Activity:
  - status changes + comments (stored as audit log or alert events)

Actions:

- acknowledge + assign
- resolve (with reason)
- mark false positive (with reason)
- create case from alert

## 8) Case Management

### 8.1 Cases List

Route: `/cases`

Filters:

- status
- severity
- owner
- created date range

Table columns:

- title
- status
- severity
- owner
- updated at
- linked alerts count

Actions:

- create case (manual)

### 8.2 Case Detail

Route: `/cases/:caseId`

Sections:

- Case summary: title, status, severity, owner, outcome
- Linked alerts list (click-through)
- Timeline:
  - notes
  - status changes
  - attachments
- Attachments panel (upload + list; signed URLs)

Actions:

- change status
- reassign owner
- add note
- close case with outcome

## 9) Settings

### 9.1 Users & Roles

Route: `/settings/users`

Table:

- email
- role
- added at

Actions:

- invite/add user (MVP approach)
- change role
- remove user

### 9.2 Notifications

Route: `/settings/notifications`

Fields:

- enabled toggle
- minimum severity
- email recipients list

## 10) UX Quality Checklist

- Every list screen has: loading, empty, error states
- All mutation actions provide: optimistic UI or clear spinners, success toast, error banner
- Filters persist in URL query params for shareable views
- Tables support sorting by primary columns and basic search

