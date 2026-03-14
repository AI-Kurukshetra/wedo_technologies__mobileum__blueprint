import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;
    const scheduleCronRaw = body?.scheduleCron == null ? "" : String(body.scheduleCron).trim();
    const scheduleCron = scheduleCronRaw || null;
    const recipients = Array.isArray(body?.recipients) ? body.recipients.map((x: any) => String(x).trim()).filter(Boolean) : [];

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
      .from("reports")
      .update({
        schedule_cron: scheduleCron,
        recipients,
        updated_at: new Date().toISOString()
      })
      .eq("org_id", orgId)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await (supabase as any).from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "report.schedule_updated",
      entity_type: "report",
      entity_id: id,
      metadata: { scheduleCron, recipients }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
