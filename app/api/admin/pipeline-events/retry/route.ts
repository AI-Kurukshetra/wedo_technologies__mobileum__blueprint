import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser } from "@/lib/api/rbac";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const eventId = String(body?.eventId ?? "").trim();
    if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    if (role !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    const { data: existing, error: fetchErr } = await supabase
      .from("pipeline_events")
      .select("id,status")
      .eq("org_id", orgId)
      .eq("id", eventId)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const status = (existing as any).status;
    const allowedRetry = ["failed", "dead_lettered", "processed"];
    if (!allowedRetry.includes(status)) {
      return NextResponse.json(
        { error: `Cannot retry event with status "${status}". Retry is only allowed for failed, dead_lettered, or processed events.` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("pipeline_events")
      .update({
        status: "pending",
        locked_at: null,
        locked_by: null,
        next_attempt_at: null,
        dead_lettered_at: null,
        processed_at: null,
        last_error: null
      })
      .eq("org_id", orgId)
      .eq("id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "pipeline.retry_requested",
      entity_type: "pipeline_event",
      entity_id: null,
      metadata: { eventId }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

