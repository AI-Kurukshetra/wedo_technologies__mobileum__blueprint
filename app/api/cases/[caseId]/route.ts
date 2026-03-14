import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

export async function GET(_req: Request, ctx: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: c, error: cErr } = await supabase
      .from("cases")
      .select("id,org_id,title,description,status,severity,priority,sla_deadline,outcome,resolution_notes,owner_user_id,created_by_user_id,closed_at,created_at,updated_at")
      .eq("id", caseId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: links, error: lErr } = await supabase
      .from("case_alerts")
      .select("alert_id, alerts(id,title,severity,status,created_at)")
      .eq("org_id", orgId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });

    const linkedAlerts = (links ?? []).map((r: any) => ({
      id: r.alert_id,
      title: r.alerts?.title ?? null,
      severity: r.alerts?.severity ?? null,
      status: r.alerts?.status ?? null,
      created_at: r.alerts?.created_at ?? null
    }));

    const { data: events, error: eErr } = await supabase
      .from("case_events")
      .select("id,event_type,message,metadata,actor_user_id,created_at")
      .eq("org_id", orgId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });

    const { data: attachments, error: aErr } = await supabase
      .from("attachments")
      .select("id,filename,content_type,bytes,storage_object_path,created_at,uploaded_by_user_id")
      .eq("org_id", orgId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });

    return NextResponse.json({
      data: {
        case: c,
        linkedAlerts,
        events: events ?? [],
        attachments: attachments ?? []
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await ctx.params;
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
      .from("cases")
      .select("id,status,owner_user_id,outcome,priority,sla_deadline,resolution_notes,updated_at")
      .eq("id", caseId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const patch: any = {};
    const revenueRecovered =
      body.revenueRecovered === undefined || body.revenueRecovered === null ? null : Number(body.revenueRecovered);
    const recoveryCurrency = body.recoveryCurrency == null ? "USD" : String(body.recoveryCurrency).trim() || "USD";
    if (body.status != null) patch.status = String(body.status).trim();
    if (body.owner_user_id !== undefined) patch.owner_user_id = body.owner_user_id ? String(body.owner_user_id).trim() : null;
    if (body.outcome !== undefined) patch.outcome = body.outcome == null ? null : String(body.outcome).trim();
    if (body.priority != null) patch.priority = String(body.priority).trim();
    if (body.sla_deadline !== undefined) patch.sla_deadline = body.sla_deadline ? String(body.sla_deadline) : null;
    if (body.resolution_notes !== undefined) patch.resolution_notes = body.resolution_notes == null ? null : String(body.resolution_notes);

    if (!Object.keys(patch).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const { error: upErr } = await supabase.from("cases").update(patch).eq("id", caseId).eq("org_id", orgId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "case.updated",
      entity_type: "case",
      entity_id: caseId,
      metadata: { patch, prev: existing }
    });

    if (Number.isFinite(revenueRecovered) && (revenueRecovered as number) > 0) {
      await (supabase as any).from("revenue_recovery_events").insert({
        org_id: orgId,
        case_id: caseId,
        amount: revenueRecovered,
        currency: recoveryCurrency,
        notes: "Recorded during case update",
        recorded_by_user_id: user.id,
        recorded_at: new Date().toISOString()
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}

