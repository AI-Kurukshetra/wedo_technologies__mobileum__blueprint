import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

export async function POST(req: Request, ctx: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;
    const eventType = String(body?.eventType ?? "").trim();
    const message = String(body?.message ?? "").trim();

    if (eventType !== "note") return NextResponse.json({ error: "eventType must be 'note'" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data: c, error: cErr } = await supabase.from("cases").select("id").eq("id", caseId).eq("org_id", orgId).maybeSingle();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: inserted, error } = await supabase
      .from("case_events")
      .insert({
        org_id: orgId,
        case_id: caseId,
        actor_user_id: user.id,
        event_type: "note",
        message,
        metadata: {}
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "case.note_added",
      entity_type: "case",
      entity_id: caseId,
      metadata: { case_event_id: inserted?.id ?? null, message }
    });

    return NextResponse.json({ ok: true, id: inserted?.id ?? null });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}

