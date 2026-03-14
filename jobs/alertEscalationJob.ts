import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllOrgIds } from "@/lib/jobs/orgs";
import { escalateAlerts } from "@/lib/alerts/escalation";
import { upsertMetric } from "@/lib/metrics/store";

export async function runAlertEscalationJob(scope: { scope: "org"; orgId: string } | { scope: "all" }) {
  const supabaseAdmin = createSupabaseAdminClient();
  const orgIds = scope.scope === "org" ? [scope.orgId] : await listAllOrgIds(supabaseAdmin as any);

  const results: any[] = [];
  for (const orgId of orgIds) {
    const started = Date.now();
    const res = await escalateAlerts({ supabaseAdmin: supabaseAdmin as any, orgId });
    const latencyMs = Date.now() - started;
    results.push({ orgId, ...res });

    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "alerts_escalated_last_run", value: Number((res as any).escalated ?? 0), unit: "count" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "alert_escalation_latency_ms", value: latencyMs, unit: "ms" });
  }

  const escalated = results.reduce((acc, r) => acc + Number(r.escalated ?? 0), 0);
  return { orgs: orgIds.length, escalated, results };
}
