import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function POST(req: Request, ctx: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;
    const assignedToUserId = body?.assignedToUserId ? String(body.assignedToUserId).trim() : null;

    if (!assignedToUserId) return NextResponse.json({ error: "assignedToUserId is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: existing, error: eErr } = await supabase
      .from("alerts")
      .select("id,org_id,title,assigned_to_user_id")
      .eq("id", alertId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { error: upErr } = await supabase.from("alerts").update({ assigned_to_user_id: assignedToUserId }).eq("id", alertId).eq("org_id", orgId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "alert.assigned",
      entity_type: "alert",
      entity_id: alertId,
      metadata: { assigned_to_user_id: assignedToUserId, prev_assigned_to_user_id: (existing as any).assigned_to_user_id, title: (existing as any).title }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

