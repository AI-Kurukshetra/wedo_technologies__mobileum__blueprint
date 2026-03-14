import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllOrgIds } from "@/lib/jobs/orgs";
import { refreshCdrAggregates } from "@/lib/cdr/aggregation";
import { runRuleEvaluation } from "@/lib/rules/engine";
import { escalateAlerts } from "@/lib/alerts/escalation";
import { upsertMetric } from "@/lib/metrics/store";
import { computeNextAttemptAt } from "@/lib/pipeline/backoff";

const MAX_ATTEMPTS = 8;
const CLAIM_LIMIT = 25;

function safeIso(value: unknown) {
  const d = new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function runRealtimePipelineJob(scope: { scope: "org"; orgId: string } | { scope: "all" }) {
  const supabaseAdmin = createSupabaseAdminClient();
  const orgIds = scope.scope === "org" ? [scope.orgId] : await listAllOrgIds(supabaseAdmin as any);

  const workerId = `jobs.realtimePipelineJob:${process.pid}:${Math.random().toString(16).slice(2)}`;

  const results: any[] = [];

  for (const orgId of orgIds) {
    const startedOrg = Date.now();
    let claimed = 0;
    let processed = 0;
    let failed = 0;
    let deadLettered = 0;

    const { data: events, error: claimErr } = await (supabaseAdmin as any).rpc("pipeline_claim_events", {
      p_org_id: orgId,
      p_limit: CLAIM_LIMIT,
      p_worker: workerId
    });
    if (claimErr) throw claimErr;

    const rows = (events ?? []) as any[];
    claimed = rows.length;

    for (const ev of rows) {
      const eventId = String(ev.id);
      const eventType = String(ev.event_type ?? "");
      const attemptCount = Number(ev.attempt_count ?? 0);
      try {
        if (eventType === "cdr.ingested") {
          const payload = (ev.payload ?? {}) as any;
          const fromIso = safeIso(payload.fromIso);
          const toIso = safeIso(payload.toIso);
          if (!fromIso || !toIso) throw new Error("invalid_payload_range");

          const from = new Date(new Date(fromIso).getTime() - 5 * 60 * 1000).toISOString();
          const to = new Date(new Date(toIso).getTime() + 5 * 60 * 1000).toISOString();

          // 1) Update hourly aggregates around the ingest window (idempotent upsert)
          await refreshCdrAggregates({
            supabaseAdmin: supabaseAdmin as any,
            orgId,
            fromTs: from,
            toTs: to,
            granularity: "hourly",
            dimensions: ["destination_country", "account_id", "carrier_id"]
          });

          // 2) Evaluate enabled rules using event end time as "now" (alerts are deduped by unique constraint)
          await runRuleEvaluation({ supabase: supabaseAdmin as any, orgId, now: new Date(toIso) });

          // 3) Deliver escalations (webhooks) and mark alerts notified when delivered
          await escalateAlerts({ supabaseAdmin: supabaseAdmin as any, orgId });
        } else {
          await (supabaseAdmin as any).from("audit_log").insert({
            org_id: orgId,
            actor_user_id: null,
            action: "pipeline.event_skipped",
            entity_type: "pipeline_event",
            entity_id: null,
            metadata: { eventId, eventType, reason: "unknown_type" }
          });
        }

        const { error: doneErr } = await (supabaseAdmin as any)
          .from("pipeline_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
            next_attempt_at: null,
            last_error: null
          })
          .eq("id", eventId)
          .eq("org_id", orgId);
        if (doneErr) throw doneErr;

        processed += 1;
      } catch (e: any) {
        const msg = e?.message ?? "pipeline_event_failed";
        const nextAttempt = computeNextAttemptAt({ now: new Date(), attemptCount });
        const newAttempt = attemptCount + 1;
        const terminal = newAttempt >= MAX_ATTEMPTS;

        const update: any = {
          status: terminal ? "dead_lettered" : "failed",
          attempt_count: newAttempt,
          locked_at: null,
          locked_by: null,
          last_error: msg,
          next_attempt_at: terminal ? null : nextAttempt.toISOString(),
          dead_lettered_at: terminal ? new Date().toISOString() : null
        };

        await (supabaseAdmin as any).from("pipeline_events").update(update).eq("id", eventId).eq("org_id", orgId);

        await (supabaseAdmin as any).from("audit_log").insert({
          org_id: orgId,
          actor_user_id: null,
          action: terminal ? "pipeline.dead_lettered" : "pipeline.failed",
          entity_type: "pipeline_event",
          entity_id: null,
          metadata: { eventId, eventType, error: msg, attempt: newAttempt, nextAttemptAt: update.next_attempt_at }
        });

        failed += 1;
        if (terminal) deadLettered += 1;
      }
    }

    // Metrics: queue depth (best-effort)
    const { count: queueDepth } = await (supabaseAdmin as any)
      .from("pipeline_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["pending", "failed"]);

    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "pipeline_events_claimed", value: claimed, unit: "count" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "pipeline_events_processed", value: processed, unit: "count" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "pipeline_events_failed", value: failed, unit: "count" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "pipeline_queue_depth", value: Number(queueDepth ?? 0), unit: "count" });
    await upsertMetric({
      supabaseAdmin: supabaseAdmin as any,
      orgId,
      key: "pipeline_latency_ms",
      value: Date.now() - startedOrg,
      unit: "ms",
      metadata: { claimed }
    });

    results.push({ orgId, claimed, processed, failed, deadLettered, latencyMs: Date.now() - startedOrg });
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.claimed += Number(r.claimed ?? 0);
      acc.processed += Number(r.processed ?? 0);
      acc.failed += Number(r.failed ?? 0);
      acc.deadLettered += Number(r.deadLettered ?? 0);
      return acc;
    },
    { claimed: 0, processed: 0, failed: 0, deadLettered: 0 }
  );

  return { orgs: orgIds.length, workerId, ...totals, results };
}

