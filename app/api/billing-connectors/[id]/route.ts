import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;

    const patch: any = {};
    if (body.name !== undefined) patch.name = String(body.name ?? "").trim();
    if (body.connectorType !== undefined) patch.connector_type = String(body.connectorType ?? "").trim();
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (body.config !== undefined) patch.config = typeof body.config === "object" && body.config ? body.config : {};
    if (!Object.keys(patch).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    patch.updated_by_user_id = user.id;

    const { error } = await (supabase as any)
      .from("billing_connectors")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await (supabase as any).from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "billing_connector.updated",
      entity_type: "billing_connector",
      entity_id: id,
      metadata: { patch }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { error } = await (supabase as any)
      .from("billing_connectors")
      .delete()
      .eq("org_id", orgId)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await (supabase as any).from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "billing_connector.deleted",
      entity_type: "billing_connector",
      entity_id: id,
      metadata: {}
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
