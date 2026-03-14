import { NextResponse } from "next/server";

import type { JobName } from "@/jobs/types";
import { runJob } from "@/jobs/run";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

const jobNames = new Set<JobName>([
  "cdrAggregationJob",
  "ruleEvaluationJob",
  "alertEscalationJob",
  "metricsRefreshJob",
  "scheduledReportsJob",
  "realtimePipelineJob"
]);

async function requireOrgRole(params: { supabase: any; orgId: string; userId: string }) {
  const { data, error } = await params.supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw error;
  const role = data?.role ?? null;
  return role as string | null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as any;
    const job = String(body?.job ?? "").trim() as JobName;
    const scopeRaw = String(body?.scope ?? "active_org").trim();
    const orgIdFromBody = body?.orgId ? String(body.orgId).trim() : null;

    if (!job || !jobNames.has(job)) {
      return NextResponse.json(
        {
          error:
            "Invalid job. Use one of: cdrAggregationJob, ruleEvaluationJob, alertEscalationJob, metricsRefreshJob, scheduledReportsJob, realtimePipelineJob"
        },
        { status: 400 }
      );
    }

    const activeOrgId = await getActiveOrgIdForUser(supabase as any, user.id);
    const orgId = scopeRaw === "org" && orgIdFromBody ? orgIdFromBody : activeOrgId;
    if (!orgId && scopeRaw !== "all") return NextResponse.json({ error: "No org selected" }, { status: 400 });

    // Authorization:
    // - org scope: admin/manager can run
    // - all scope: admin only (based on active org role)
    const roleForActive = activeOrgId ? await requireOrgRole({ supabase, orgId: activeOrgId, userId: user.id }) : null;
    const roleForOrg = orgId ? await requireOrgRole({ supabase, orgId, userId: user.id }) : null;

    if (scopeRaw === "all") {
      if (roleForActive !== "admin") return NextResponse.json({ error: "Admin role required for scope=all" }, { status: 403 });
      const result = await runJob(job, { scope: "all" });
      return NextResponse.json({ ok: true, result });
    }

    if (!roleForOrg || !["admin", "manager"].includes(roleForOrg)) {
      return NextResponse.json({ error: "Admin or manager role required" }, { status: 403 });
    }

    const result = await runJob(job, { scope: "org", orgId: orgId! });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
