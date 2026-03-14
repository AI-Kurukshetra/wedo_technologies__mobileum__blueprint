import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllOrgIds } from "@/lib/jobs/orgs";
import { refreshMetrics } from "@/lib/metrics/refresh";

export async function runMetricsRefreshJob(scope: { scope: "org"; orgId: string } | { scope: "all" }) {
  const supabaseAdmin = createSupabaseAdminClient();
  const orgIds = scope.scope === "org" ? [scope.orgId] : await listAllOrgIds(supabaseAdmin as any);

  const results: any[] = [];
  for (const orgId of orgIds) {
    const res = await refreshMetrics({ supabaseAdmin: supabaseAdmin as any, orgId });
    results.push({ orgId, ...res });
  }

  return { orgs: orgIds.length, results };
}

