import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { parseDateRange, parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { fromIso, toIso } = parseDateRange(url.searchParams);
    const limit = parseLimit(url.searchParams, 200, 2000);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [], totals: { recovered: 0, count: 0 } });

    const { data, error } = await (supabase as any)
      .from("revenue_recovery_events")
      .select("id,case_id,alert_id,amount,currency,notes,recorded_by_user_id,recorded_at")
      .eq("org_id", orgId)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = data ?? [];
    const recovered = rows.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

    return NextResponse.json({
      data: rows,
      totals: {
        recovered,
        count: rows.length
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const caseId = body?.caseId ? String(body.caseId).trim() : null;
    const alertId = body?.alertId ? String(body.alertId).trim() : null;
    const amount = Number(body?.amount ?? NaN);
    const currency = String(body?.currency ?? "USD").trim() || "USD";
    const notes = body?.notes == null ? null : String(body.notes);

    if (!caseId && !alertId) return NextResponse.json({ error: "caseId or alertId is required" }, { status: 400 });
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data, error } = await (supabase as any)
      .from("revenue_recovery_events")
      .insert({
        org_id: orgId,
        case_id: caseId,
        alert_id: alertId,
        amount,
        currency,
        notes,
        recorded_by_user_id: user.id,
        recorded_at: new Date().toISOString()
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await (supabase as any).from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "revenue_recovery.recorded",
      entity_type: "revenue_recovery_event",
      entity_id: data.id,
      metadata: { caseId, alertId, amount, currency }
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
