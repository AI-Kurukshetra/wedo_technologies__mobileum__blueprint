import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshCdrAggregates } from "@/lib/cdr/aggregation";
import { listAllOrgIds } from "@/lib/jobs/orgs";
import { upsertMetric } from "@/lib/metrics/store";

export async function runCdrAggregationJob(scope: { scope: "org"; orgId: string } | { scope: "all" }) {
  const supabaseAdmin = createSupabaseAdminClient();
  const orgIds = scope.scope === "org" ? [scope.orgId] : await listAllOrgIds(supabaseAdmin as any);

  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now.getTime() - 65 * 60 * 1000).toISOString();

  const results: any[] = [];
  for (const orgId of orgIds) {
    const started = Date.now();
    const res = await refreshCdrAggregates({
      supabaseAdmin: supabaseAdmin as any,
      orgId,
      fromTs: from,
      toTs: to,
      granularity: "hourly",
      dimensions: ["destination_country", "account_id", "carrier_id"]
    });
    const latencyMs = Date.now() - started;
    results.push({ orgId, ...res });

    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "cdr_rows_scanned_last_aggregation", value: Number((res as any).rowsScanned ?? 0), unit: "rows" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "cdr_aggregates_upserted_last_aggregation", value: Number((res as any).upserted ?? 0), unit: "rows" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "cdr_aggregation_latency_ms", value: latencyMs, unit: "ms" });
  }

  return { orgs: orgIds.length, from, to, results };
}
