import type { SupabaseClient } from "@supabase/supabase-js";

type CdrRow = {
  org_id: string;
  call_start_at: string;
  destination_country: string | null;
  account_id: string | null;
  carrier_id: string | null;
  duration_seconds: number | null;
  revenue_amount: string | number | null;
  cost_amount: string | number | null;
  answer_status: string | null;
};

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function hourBucket(iso: string) {
  const d = new Date(iso);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function dayBucket(iso: string) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

type AggregateKey = string;

type Aggregate = {
  org_id: string;
  bucket_start_at: string;
  dimension_type: string;
  dimension_value: string;
  call_count: number;
  total_duration_seconds: number;
  total_revenue: number;
  total_cost: number;
  answered_count: number;
  failed_count: number;
};

function aggKey(bucket: string, dimensionType: string, dimensionValue: string): AggregateKey {
  return `${bucket}|${dimensionType}|${dimensionValue}`;
}

export async function refreshCdrAggregates(params: {
  supabaseAdmin: SupabaseClient;
  orgId: string;
  fromTs: string;
  toTs: string;
  granularity: "hourly" | "daily";
  dimensions?: Array<"destination_country" | "account_id" | "carrier_id">;
}) {
  const { supabaseAdmin, orgId, fromTs, toTs, granularity } = params;
  const dimensions = params.dimensions?.length ? params.dimensions : ["destination_country"];

  const { data, error } = await supabaseAdmin
    .from("cdr_records")
    .select("org_id,call_start_at,destination_country,account_id,carrier_id,duration_seconds,revenue_amount,cost_amount,answer_status")
    .eq("org_id", orgId)
    .gte("call_start_at", fromTs)
    .lte("call_start_at", toTs)
    .limit(50000);

  if (error) throw error;

  const rows = (data ?? []) as CdrRow[];
  const bucketFn = granularity === "hourly" ? hourBucket : dayBucket;
  const aggregates = new Map<AggregateKey, Aggregate>();

  for (const r of rows) {
    const bucket = bucketFn(r.call_start_at);
    const duration = Math.max(0, Math.round(Number(r.duration_seconds ?? 0)));
    const revenue = toNumber(r.revenue_amount);
    const cost = toNumber(r.cost_amount);
    const answered = String(r.answer_status ?? "").toLowerCase() === "answered" ? 1 : 0;
    const failed = ["failed", "no_answer", "busy"].includes(String(r.answer_status ?? "").toLowerCase()) ? 1 : 0;

    for (const dim of dimensions) {
      const valRaw = (r as any)[dim] as string | null;
      const dimensionValue = (valRaw ?? "—").trim() || "—";
      const key = aggKey(bucket, dim, dimensionValue);

      const current =
        aggregates.get(key) ??
        ({
          org_id: orgId,
          bucket_start_at: bucket,
          dimension_type: dim,
          dimension_value: dimensionValue,
          call_count: 0,
          total_duration_seconds: 0,
          total_revenue: 0,
          total_cost: 0,
          answered_count: 0,
          failed_count: 0
        } satisfies Aggregate);

      current.call_count += 1;
      current.total_duration_seconds += duration;
      current.total_revenue += revenue;
      current.total_cost += cost;
      current.answered_count += answered;
      current.failed_count += failed;

      aggregates.set(key, current);
    }
  }

  const payload = Array.from(aggregates.values()).map((a) => ({
    org_id: a.org_id,
    bucket_start_at: a.bucket_start_at,
    dimension_type: a.dimension_type,
    dimension_value: a.dimension_value,
    call_count: a.call_count,
    total_duration_seconds: a.total_duration_seconds,
    total_revenue: a.total_revenue,
    total_cost: a.total_cost,
    answered_count: a.answered_count,
    failed_count: a.failed_count
  }));

  if (!payload.length) {
    return { rowsScanned: rows.length, upserted: 0 };
  }

  const targetTable = granularity === "hourly" ? "cdr_aggregates_hourly" : "cdr_aggregates_daily";

  const { error: upErr } = await supabaseAdmin.from(targetTable).upsert(payload, {
    onConflict: "org_id,bucket_start_at,dimension_type,dimension_value"
  });
  if (upErr) throw upErr;

  return { rowsScanned: rows.length, upserted: payload.length, table: targetTable };
}

