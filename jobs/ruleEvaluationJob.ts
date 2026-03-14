import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllOrgIds } from "@/lib/jobs/orgs";
import { runRuleEvaluation } from "@/lib/rules/engine";
import { upsertMetric } from "@/lib/metrics/store";

export async function runRuleEvaluationJob(scope: { scope: "org"; orgId: string } | { scope: "all" }) {
  const supabaseAdmin = createSupabaseAdminClient();
  const orgIds = scope.scope === "org" ? [scope.orgId] : await listAllOrgIds(supabaseAdmin as any);

  const results: any[] = [];
  for (const orgId of orgIds) {
    const started = Date.now();
    const res = await runRuleEvaluation({ supabase: supabaseAdmin as any, orgId });
    const latencyMs = Date.now() - started;
    results.push({ orgId, ...res });

    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "rules_evaluated", value: Number(res.evaluatedRules ?? 0), unit: "count" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "alerts_generated", value: Number(res.insertedAlerts ?? 0), unit: "count" });
    await upsertMetric({ supabaseAdmin: supabaseAdmin as any, orgId, key: "processing_latency", value: latencyMs, unit: "ms", metadata: { source: "rule_evaluation" } });
  }

  const insertedAlerts = results.reduce((acc, r) => acc + Number(r.insertedAlerts ?? 0), 0);
  return { orgs: orgIds.length, insertedAlerts, results };
}
