import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { createNextRuleVersion } from "@/lib/rules/versioning";

const severityValues = new Set(["low", "medium", "high", "critical"] as const);
const statusValues = new Set(["draft", "enabled", "disabled"] as const);
const dimensionValues = new Set(["destination_country", "account_id", "carrier_id", "a_party"] as const);

export async function GET(_req: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("fraud_rules")
      .select("id,org_id,name,description,status,severity,window_minutes,dimension_type,conditions,dedup_minutes,created_by_user_id,updated_by_user_id,created_at,updated_at")
      .eq("id", ruleId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;

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
      .select("id,name,description,status,severity,window_minutes,dimension_type,conditions,dedup_minutes,created_at,updated_at")
      .eq("id", ruleId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const patch: any = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description);
    if (body.status != null) {
      const status = String(body.status).trim();
      if (!statusValues.has(status as any)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      patch.status = status;
    }
    if (body.severity != null) {
      const severity = String(body.severity).trim();
      if (!severityValues.has(severity as any)) return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
      patch.severity = severity;
    }
    if (body.window_minutes != null) {
      const windowMinutesRaw = Number(body.window_minutes);
      if (!Number.isFinite(windowMinutesRaw) || windowMinutesRaw < 1 || windowMinutesRaw > 1440) {
        return NextResponse.json({ error: "Invalid window_minutes" }, { status: 400 });
      }
      patch.window_minutes = Math.round(windowMinutesRaw);
    }
    if (body.dimension_type != null) {
      const dim = String(body.dimension_type).trim();
      if (!dimensionValues.has(dim as any)) return NextResponse.json({ error: "Invalid dimension_type" }, { status: 400 });
      patch.dimension_type = dim;
    }
    if (body.conditions !== undefined) patch.conditions = body.conditions ?? {};
    if (body.dedup_minutes != null) {
      const dedupMinutesRaw = Number(body.dedup_minutes);
      if (!Number.isFinite(dedupMinutesRaw) || dedupMinutesRaw < 1 || dedupMinutesRaw > 24 * 60) {
        return NextResponse.json({ error: "Invalid dedup_minutes" }, { status: 400 });
      }
      patch.dedup_minutes = Math.round(dedupMinutesRaw);
    }
    patch.updated_by_user_id = user.id;

    // version snapshot first (per requirement)
    const snapshot = { ...(existing as any), ...patch, version_created_at: new Date().toISOString() };
    const version = await createNextRuleVersion({ supabase: supabase as any, orgId, ruleId, snapshot, createdByUserId: user.id });

    const { error: upErr } = await supabase.from("fraud_rules").update(patch).eq("id", ruleId).eq("org_id", orgId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "rule.updated",
      entity_type: "rule",
      entity_id: ruleId,
      metadata: { patch, version_id: version.id, version: version.version, prev: existing }
    });

    return NextResponse.json({ ok: true, version });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
