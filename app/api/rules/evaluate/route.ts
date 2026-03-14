import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { runRuleEvaluation } from "@/lib/rules/engine";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as any;
    const ruleIds = Array.isArray(body?.ruleIds) ? body.ruleIds.map((x: any) => String(x)).filter(Boolean) : undefined;
    const dryRun = Boolean(body?.dryRun);

    const result = await runRuleEvaluation({ supabase: supabase as any, orgId, ruleIds, dryRun });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

