import type { SupabaseClient } from "@supabase/supabase-js";

type CheckResult = {
  name: string;
  status: "passed" | "failed";
  metrics: Record<string, any>;
  details?: Record<string, any>;
};

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function runDataQualityChecks(params: {
  supabase: SupabaseClient;
  orgId: string;
  fromIso: string;
  toIso: string;
  actorUserId: string;
}) {
  const { supabase, orgId, fromIso, toIso, actorUserId } = params;

  const checks: CheckResult[] = [];

  const { count: totalRows, error: totalErr } = await (supabase as any)
    .from("cdr_records")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("call_start_at", fromIso)
    .lte("call_start_at", toIso);
  if (totalErr) throw totalErr;

  const total = Number(totalRows ?? 0);

  const { count: missingPartyRows, error: partyErr } = await (supabase as any)
    .from("cdr_records")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("call_start_at", fromIso)
    .lte("call_start_at", toIso)
    .or("a_party.is.null,b_party.is.null,a_party.eq.,b_party.eq.");
  if (partyErr) throw partyErr;

  const missingParty = Number(missingPartyRows ?? 0);
  checks.push({
    name: "cdr_required_parties",
    status: missingParty === 0 ? "passed" : "failed",
    metrics: {
      totalRows: total,
      invalidRows: missingParty,
      invalidRate: total ? missingParty / total : 0
    }
  });

  const { count: badDurationRows, error: durationErr } = await (supabase as any)
    .from("cdr_records")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("call_start_at", fromIso)
    .lte("call_start_at", toIso)
    .or("duration_seconds.lt.0,duration_seconds.gt.43200");
  if (durationErr) throw durationErr;

  const badDuration = Number(badDurationRows ?? 0);
  checks.push({
    name: "cdr_duration_bounds",
    status: badDuration === 0 ? "passed" : "failed",
    metrics: {
      totalRows: total,
      outOfRangeRows: badDuration,
      outOfRangeRate: total ? badDuration / total : 0
    }
  });

  const { data: duplicates, error: dupErr } = await (supabase as any)
    .from("cdr_records")
    .select("source_row_hash")
    .eq("org_id", orgId)
    .gte("call_start_at", fromIso)
    .lte("call_start_at", toIso)
    .limit(50000);
  if (dupErr) throw dupErr;

  const seen = new Set<string>();
  let duplicateCount = 0;
  const duplicateSamples: string[] = [];
  for (const row of duplicates ?? []) {
    const hash = String((row as any).source_row_hash ?? "").trim();
    if (!hash) continue;
    if (seen.has(hash)) {
      duplicateCount += 1;
      if (duplicateSamples.length < 20) duplicateSamples.push(hash);
    } else {
      seen.add(hash);
    }
  }
  checks.push({
    name: "cdr_duplicate_hash",
    status: duplicateCount === 0 ? "passed" : "failed",
    metrics: {
      scannedRows: (duplicates ?? []).length,
      duplicates: duplicateCount
    },
    details: duplicateSamples.length ? { sampleHashes: duplicateSamples } : {}
  });

  const { data: aggregateRows, error: aggregateErr } = await (supabase as any)
    .from("cdr_aggregates_hourly")
    .select("call_count,total_revenue,total_cost")
    .eq("org_id", orgId)
    .gte("bucket_start_at", fromIso)
    .lte("bucket_start_at", toIso)
    .limit(50000);
  if (aggregateErr) throw aggregateErr;

  let negativeRevenueRows = 0;
  let negativeCostRows = 0;
  for (const row of aggregateRows ?? []) {
    if (toNumber((row as any).total_revenue) < 0) negativeRevenueRows += 1;
    if (toNumber((row as any).total_cost) < 0) negativeCostRows += 1;
  }

  checks.push({
    name: "aggregate_financial_sanity",
    status: negativeRevenueRows === 0 && negativeCostRows === 0 ? "passed" : "failed",
    metrics: {
      scannedRows: (aggregateRows ?? []).length,
      negativeRevenueRows,
      negativeCostRows
    }
  });

  const failed = checks.filter((c) => c.status === "failed").length;
  const status = failed > 0 ? "failed" : "passed";

  const { data: inserted, error: insertErr } = await (supabase as any)
    .from("data_quality_runs")
    .insert({
      org_id: orgId,
      period_start: fromIso,
      period_end: toIso,
      status,
      checks_total: checks.length,
      checks_failed: failed,
      summary: {
        totalRows: total,
        failedChecks: failed
      },
      details: {
        checks
      },
      created_by_user_id: actorUserId
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  const runId = String(inserted.id);
  await (supabase as any).from("audit_log").insert({
    org_id: orgId,
    actor_user_id: actorUserId,
    action: "data_quality.run",
    entity_type: "data_quality_run",
    entity_id: runId,
    metadata: {
      periodStart: fromIso,
      periodEnd: toIso,
      checksTotal: checks.length,
      checksFailed: failed,
      status
    }
  });

  return {
    runId,
    status,
    checksTotal: checks.length,
    checksFailed: failed,
    checks
  };
}
