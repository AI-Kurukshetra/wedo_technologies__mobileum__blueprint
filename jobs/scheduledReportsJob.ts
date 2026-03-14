import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllOrgIds } from "@/lib/jobs/orgs";
import { generateAndStoreReport, supportedReportTypes, type ReportType } from "@/lib/reports/generator";
import { isReportDue } from "@/lib/reports/schedule";

export async function runScheduledReportsJob(scope: { scope: "org"; orgId: string } | { scope: "all" }) {
  const supabaseAdmin = createSupabaseAdminClient();
  const orgIds = scope.scope === "org" ? [scope.orgId] : await listAllOrgIds(supabaseAdmin as any);

  let generated = 0;
  let skipped = 0;
  const results: any[] = [];

  for (const orgId of orgIds) {
    const { data: reports, error } = await (supabaseAdmin as any)
      .from("reports")
      .select("id,name,report_type,schedule_cron,last_run_at,config,recipients")
      .eq("org_id", orgId)
      .not("schedule_cron", "is", null)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    for (const report of reports ?? []) {
      const scheduleCron = (report as any).schedule_cron as string | null;
      if (!isReportDue(scheduleCron, (report as any).last_run_at ?? null)) {
        skipped += 1;
        continue;
      }

      const type = String((report as any).report_type ?? "") as ReportType;
      if (!supportedReportTypes.has(type)) {
        skipped += 1;
        continue;
      }

      const config = ((report as any).config ?? {}) as Record<string, any>;
      const fromIso = String(config.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const toIso = String(config.to ?? new Date().toISOString());

      try {
        const out = await generateAndStoreReport({
          supabase: supabaseAdmin as any,
          orgId,
          actorUserId: null,
          type,
          fromIso,
          toIso,
          name: String((report as any).name ?? "").trim() || undefined,
          scheduleCron,
          recipients: Array.isArray((report as any).recipients) ? (report as any).recipients : []
        });
        generated += 1;
        results.push({ orgId, reportId: out.id, sourceReportId: (report as any).id });
      } catch (e: any) {
        skipped += 1;
        results.push({
          orgId,
          sourceReportId: (report as any).id,
          error: e?.message ?? "Report generation failed"
        });
      }
    }
  }

  return {
    orgs: orgIds.length,
    generated,
    skipped,
    results
  };
}
