import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { runRuleEvaluation } from "@/lib/rules/engine";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const result = await runRuleEvaluation({ supabase: supabase as any, orgId });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "rules.evaluated",
      entity_type: "rule",
      entity_id: null,
      metadata: { evaluatedRules: result.evaluatedRules, insertedAlerts: result.insertedAlerts, warnings: result.warnings }
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
