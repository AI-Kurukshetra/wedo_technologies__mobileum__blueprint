import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { createNextRuleVersion } from "@/lib/rules/versioning";

export async function POST(_req: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data: existing, error: eErr } = await supabase
      .from("fraud_rules")
      .select("id,status,name,description,severity,window_minutes,dimension_type,conditions,dedup_minutes")
      .eq("id", ruleId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const patch = { status: "enabled", updated_by_user_id: user.id };
    const snapshot = { ...(existing as any), ...patch, version_created_at: new Date().toISOString() };
    const version = await createNextRuleVersion({ supabase: supabase as any, orgId, ruleId, snapshot, createdByUserId: user.id });

    const { error: upErr } = await supabase.from("fraud_rules").update(patch).eq("id", ruleId).eq("org_id", orgId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "rule.enabled",
      entity_type: "rule",
      entity_id: ruleId,
      metadata: { version_id: version.id, version: version.version, prev_status: (existing as any).status }
    });

    return NextResponse.json({ ok: true, version });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}

