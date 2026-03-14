import type { SupabaseClient } from "@supabase/supabase-js";

type NumericLike = number | string | null | undefined;

export type ReconcileOptions = {
  tolerance?: number;
  matchKey?: string;
  maxMismatches?: number;
};

export type ReconcileRequest = {
  orgId: string;
  sourceA: string;
  sourceB: string;
  periodStart: string;
  periodEnd: string;
  options?: ReconcileOptions;
};

export type ReconcileOutput = {
  reconciliationId: string;
  matchedCount: number;
  mismatchedCount: number;
  totalDelta: number;
  mismatches: Array<{
    key: string;
    sourceAValue: number;
    sourceBValue: number;
    delta: number;
  }>;
};

function toNumber(value: NumericLike) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function toDateOnly(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeKey(value: unknown) {
  const s = value == null ? "" : String(value).trim();
  return s || "—";
}

async function fetchSourceSeries(params: {
  supabase: SupabaseClient;
  orgId: string;
  source: string;
  periodStart: string;
  periodEnd: string;
}) {
  const source = params.source.trim().toLowerCase();
  if (source === "cdr_revenue") {
    const { data, error } = await params.supabase.rpc("analytics_revenue_leakage", {
      from_ts: params.periodStart,
      to_ts: params.periodEnd
    });
    if (error) throw error;
    const series = ((data as any)?.series ?? []) as any[];
    return series.map((r) => ({ key: normalizeKey(r.day), value: toNumber(r.revenue) }));
  }

  if (source === "cdr_cost") {
    const { data, error } = await params.supabase.rpc("analytics_revenue_leakage", {
      from_ts: params.periodStart,
      to_ts: params.periodEnd
    });
    if (error) throw error;
    const series = ((data as any)?.series ?? []) as any[];
    return series.map((r) => ({ key: normalizeKey(r.day), value: toNumber(r.cost) }));
  }

  if (source === "settlements_due") {
    const fromDate = toDateOnly(params.periodStart);
    const toDate = toDateOnly(params.periodEnd);
    const q = params.supabase
      .from("settlements")
      .select("period_start,amount_due")
      .eq("org_id", params.orgId)
      .order("period_start", { ascending: true });
    if (fromDate) q.gte("period_start", fromDate);
    if (toDate) q.lte("period_start", toDate);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ key: normalizeKey(r.period_start), value: toNumber(r.amount_due) }));
  }

  if (source === "settlements_paid") {
    const fromDate = toDateOnly(params.periodStart);
    const toDate = toDateOnly(params.periodEnd);
    const q = params.supabase
      .from("settlements")
      .select("period_start,amount_paid")
      .eq("org_id", params.orgId)
      .order("period_start", { ascending: true });
    if (fromDate) q.gte("period_start", fromDate);
    if (toDate) q.lte("period_start", toDate);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ key: normalizeKey(r.period_start), value: toNumber(r.amount_paid) }));
  }

  if (source === "alerts_count") {
    const { data, error } = await params.supabase
      .from("alerts")
      .select("created_at")
      .eq("org_id", params.orgId)
      .gte("created_at", params.periodStart)
      .lte("created_at", params.periodEnd)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const map = new Map<string, number>();
    for (const r of data ?? []) {
      const key = normalizeKey(String((r as any).created_at).slice(0, 10));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }

  if (source === "cases_count") {
    const { data, error } = await params.supabase
      .from("cases")
      .select("created_at")
      .eq("org_id", params.orgId)
      .gte("created_at", params.periodStart)
      .lte("created_at", params.periodEnd)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const map = new Map<string, number>();
    for (const r of data ?? []) {
      const key = normalizeKey(String((r as any).created_at).slice(0, 10));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }

  throw new Error(`Unsupported source: ${params.source}`);
}

function aggregateByKey(rows: Array<{ key: string; value: number }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeKey(row.key);
    map.set(key, (map.get(key) ?? 0) + toNumber(row.value));
  }
  return map;
}

export async function runReconciliation(params: {
  supabase: SupabaseClient;
  request: ReconcileRequest;
  actorUserId: string;
}) {
  const { supabase, request, actorUserId } = params;
  const tolerance = Math.max(0, toNumber(request.options?.tolerance ?? 0));
  const maxMismatches = Math.max(1, Math.min(1000, Math.round(toNumber(request.options?.maxMismatches ?? 250))));

  const sourceA = await fetchSourceSeries({
    supabase,
    orgId: request.orgId,
    source: request.sourceA,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd
  });
  const sourceB = await fetchSourceSeries({
    supabase,
    orgId: request.orgId,
    source: request.sourceB,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd
  });

  const aByKey = aggregateByKey(sourceA);
  const bByKey = aggregateByKey(sourceB);
  const keys = new Set<string>([...aByKey.keys(), ...bByKey.keys()]);

  let matchedCount = 0;
  let mismatchedCount = 0;
  let totalDelta = 0;
  const mismatches: ReconcileOutput["mismatches"] = [];

  for (const key of keys) {
    const a = toNumber(aByKey.get(key));
    const b = toNumber(bByKey.get(key));
    const delta = a - b;
    if (Math.abs(delta) <= tolerance) {
      matchedCount += 1;
    } else {
      mismatchedCount += 1;
      totalDelta += delta;
      if (mismatches.length < maxMismatches) {
        mismatches.push({
          key,
          sourceAValue: a,
          sourceBValue: b,
          delta
        });
      }
    }
  }

  const { data: reconciliation, error: recErr } = await (supabase as any)
    .from("reconciliations")
    .insert({
      org_id: request.orgId,
      name: `${request.sourceA} vs ${request.sourceB}`,
      source_a: request.sourceA,
      source_b: request.sourceB,
      period_start: toDateOnly(request.periodStart),
      period_end: toDateOnly(request.periodEnd),
      status: mismatchedCount ? "mismatch_found" : "matched",
      metrics: {
        sourceARecords: sourceA.length,
        sourceBRecords: sourceB.length,
        matchedCount,
        mismatchedCount,
        totalDelta,
        tolerance
      },
      metadata: {
        options: request.options ?? {},
        generatedAt: new Date().toISOString()
      }
    })
    .select("id")
    .single();
  if (recErr) throw recErr;

  const reconciliationId = String(reconciliation.id);
  if (mismatches.length) {
    const payload = mismatches.map((m) => ({
      org_id: request.orgId,
      reconciliation_id: reconciliationId,
      status: "mismatch",
      match_key: m.key,
      source_a_value: m.sourceAValue,
      source_b_value: m.sourceBValue,
      delta: m.delta,
      payload: { sourceA: request.sourceA, sourceB: request.sourceB }
    }));
    const { error: resultsErr } = await (supabase as any).from("reconciliation_results").insert(payload);
    if (resultsErr) throw resultsErr;
  }

  await (supabase as any).from("audit_log").insert({
    org_id: request.orgId,
    actor_user_id: actorUserId,
    action: "reconciliation.run",
    entity_type: "reconciliation",
    entity_id: reconciliationId,
    metadata: {
      sourceA: request.sourceA,
      sourceB: request.sourceB,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      matchedCount,
      mismatchedCount,
      totalDelta,
      tolerance
    }
  });

  return {
    reconciliationId,
    matchedCount,
    mismatchedCount,
    totalDelta,
    mismatches
  } satisfies ReconcileOutput;
}
