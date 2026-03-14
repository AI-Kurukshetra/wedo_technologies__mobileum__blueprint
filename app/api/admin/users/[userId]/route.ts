import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser } from "@/lib/api/rbac";

const roleValues = new Set(["admin", "manager", "analyst", "read_only"] as const);

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await ctx.params;
    const body = (await req.json().catch(() => null)) as any;
    const nextRole = String(body?.role ?? "").trim();
    if (!roleValues.has(nextRole as any)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const actor = userRes.user;
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, actor.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const actorRole = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: actor.id });
    if (actorRole !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    const { data: existing, error: eErr } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { error } = await supabase
      .from("org_memberships")
      .update({ role: nextRole })
      .eq("org_id", orgId)
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: actor.id,
      action: "org.role_updated",
      entity_type: "org_membership",
      entity_id: null,
      metadata: { user_id: userId, prev_role: existing.role, next_role: nextRole }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const actor = userRes.user;
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, actor.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const actorRole = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: actor.id });
    if (actorRole !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    if (userId === actor.id) return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });

    const { error } = await supabase.from("org_memberships").delete().eq("org_id", orgId).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: actor.id,
      action: "org.member_removed",
      entity_type: "org_membership",
      entity_id: null,
      metadata: { user_id: userId }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

