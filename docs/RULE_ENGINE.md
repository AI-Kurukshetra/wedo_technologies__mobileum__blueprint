# TeleGuard Pro — Rule Engine

This document describes how fraud rules are evaluated against CDRs and how alerts are generated.

## Overview

Rule evaluation flow:

1. Fetch enabled rules from `fraud_rules` for the active org.
2. Fetch latest versions from `fraud_rule_versions` (latest `version` per `rule_id`).
3. Pull recent CDRs from `cdr_records` (bounded by the largest `window_minutes` among enabled rules).
4. Evaluate each rule in-memory against CDRs in its own time window.
5. Upsert alerts into `alerts` using `onConflict: org_id,dedup_key,window_start_at`.

Primary implementations:

- Engine: `lib/rules/engine.ts`
- Manual run API: `app/api/rules/evaluate/route.ts`
- Background job: `jobs/ruleEvaluationJob.ts` (scheduled via `jobs/scheduler.ts`)
- Alerts “Run evaluation” UI action: `app/(app)/alerts/page.tsx` → `app/api/alerts/run-evaluation/route.ts`

## Supported rule types

Rules are configured via `fraud_rules.conditions` (JSONB). The engine reads `conditions.rule_type` (or `conditions.type`/`kind`).

Supported `rule_type` values:

- `volume_spike`
- `international_call_spike`
- `premium_number_calls`
- `roaming_activity`
- `duplicate_cdr_detection`
- `high_cost_destination`

### Common configuration fields

- `window_minutes` (column): evaluation window size.
- `conditions.threshold`: numeric threshold for the rule (fallback: `conditions.thresholds[0].value`).
- `severity` (column): mapped to `alerts.severity`.
- `dimension_type` (column): the primary dimension tracked by the rule (used for alert dimension fields).
- `dedup_minutes` (column): UI-configurable; dedupe is enforced in DB via `alerts` unique constraint.

## Evaluation model

The engine computes a window aligned to minute boundaries:

- `windowEnd`: current time, truncated to the minute.
- `windowStart`: `windowEnd - window_minutes`.

CDRs are included if `call_start_at` is within `[windowStart, windowEnd]`.

## Alert generation + dedupe

Alerts are created as `EngineAlert` objects and then inserted into `alerts`:

- `dedup_key` is deterministic: `{rule_id}:{rule_type}:{dimension_type}:{dimension_value}`
- `window_start_at` and `window_end_at` are set to the evaluation window
- `evidence` stores computed stats (counts, totals, top values)

Insertion uses upsert:

- Conflict target: `org_id,dedup_key,window_start_at`
- Duplicate evaluations in the same window do not create duplicate alerts.

## Rule type details (high-level)

- `volume_spike`: triggers when total calls in window >= threshold.
- `international_call_spike`: groups by `destination_country` (excluding `home_country`, default `US`).
- `premium_number_calls`: checks `b_party` prefix matches `conditions.premium_prefixes` (defaults provided by engine).
- `roaming_activity`: similar to international spike; emits alerts per destination.
- `duplicate_cdr_detection`: detects duplicates by a composite key (a_party, b_party, destination, minute bucket, duration).
- `high_cost_destination`: groups by destination and triggers if summed cost >= threshold.

## Manual testing (no alert creation)

Rule test endpoint:

- `POST /api/rules/[ruleId]/test`
- Input: `{ from: string, to: string, limit?: number }`
- Output: `{ matches: [{ dimensionValue, stats, why }] }`
- Does **not** insert alerts.

## Operational usage

Background job:

- `ruleEvaluationJob` runs every 2 minutes (config: `jobs/scheduler.ts`)
- Requires `SUPABASE_SERVICE_ROLE_KEY` for service-role Supabase client

Admin manual run:

- `POST /api/admin/jobs/run` with `{ job: "ruleEvaluationJob", scope: "active_org" }`

