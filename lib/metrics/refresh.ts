import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshCdrAggregates } from "@/lib/cdr/aggregation";
import { upsertMetric } from "@/lib/metrics/store";

function median(values: number[]) {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export async function refreshMetrics(params: { supabaseAdmin: SupabaseClient; orgId: string }) {
  const { supabaseAdmin, orgId } = params;

  const now = new Date();
  const to = now.toISOString();
  const fromHourly = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const fromDaily = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const hourly = await refreshCdrAggregates({
    supabaseAdmin,
    orgId,
    fromTs: fromHourly,
    toTs: to,
    granularity: "hourly",
    dimensions: ["destination_country"]
  });

  const daily = await refreshCdrAggregates({
    supabaseAdmin,
    orgId,
    fromTs: fromDaily,
    toTs: to,
    granularity: "daily",
    dimensions: ["destination_country"]
  });

  // Observability: ingestion rate (last 5 minutes)
  const since5m = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { count: ingested5m } = await supabaseAdmin
    .from("cdr_records")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", since5m);

  const perMin = Number(ingested5m ?? 0) / 5;

  // Observability: import processing latency (median of last 50 finished imports)
  const { data: imports } = await supabaseAdmin
    .from("cdr_imports")
    .select("started_at,finished_at,status,source")
    .eq("org_id", orgId)
    .not("started_at", "is", null)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(50);

  const latencies = (imports ?? [])
    .map((i: any) => {
      const s = i.started_at ? new Date(String(i.started_at)).getTime() : NaN;
      const f = i.finished_at ? new Date(String(i.finished_at)).getTime() : NaN;
      if (!Number.isFinite(s) || !Number.isFinite(f)) return NaN;
      return Math.max(0, (f - s) / 1000);
    })
    .filter((n) => Number.isFinite(n));

  const medianLatencySec = median(latencies);

  // Observability: open alerts
  const { count: openAlerts } = await supabaseAdmin
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["new", "acknowledged"]);

  // Observability: enabled rules
  const { count: enabledRules } = await supabaseAdmin
    .from("fraud_rules")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "enabled");

  await upsertMetric({ supabaseAdmin, orgId, key: "cdr_ingestion_rate", value: perMin, unit: "rows/min", metadata: { window_minutes: 5 } });
  await upsertMetric({ supabaseAdmin, orgId, key: "processing_latency", value: medianLatencySec * 1000, unit: "ms", metadata: { samples: latencies.length, source: "imports" } });
  await upsertMetric({ supabaseAdmin, orgId, key: "open_alerts", value: Number(openAlerts ?? 0), unit: "count" });
  await upsertMetric({ supabaseAdmin, orgId, key: "enabled_rules", value: Number(enabledRules ?? 0), unit: "count" });

  return {
    hourly,
    daily,
    metrics: {
      cdr_ingestion_rate: perMin,
      processing_latency: medianLatencySec * 1000,
      open_alerts: Number(openAlerts ?? 0),
      enabled_rules: Number(enabledRules ?? 0)
    }
  };
}
