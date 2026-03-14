import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

type ResolutionType = "resolved" | "false_positive";

export async function POST(req: Request, ctx: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;
    const resolutionType = String(body?.resolutionType ?? "").trim() as ResolutionType;
    const resolutionReason = String(body?.resolutionReason ?? "").trim();
    const revenueRecovered =
      body?.revenueRecovered === undefined || body?.revenueRecovered === null ? null : Number(body.revenueRecovered);
    const recoveryCurrency = String(body?.recoveryCurrency ?? "USD").trim() || "USD";

    if (resolutionType !== "resolved" && resolutionType !== "false_positive") {
      return NextResponse.json({ error: "resolutionType must be 'resolved' or 'false_positive'" }, { status: 400 });
    }
    if (!resolutionReason) {
      return NextResponse.json({ error: "resolutionReason is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: existing, error: eErr } = await supabase
      .from("alerts")
      .select("id,org_id,title,status")
      .eq("id", alertId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date().toISOString();
    const nextStatus = resolutionType === "false_positive" ? "false_positive" : "resolved";

    const { error: upErr } = await supabase
      .from("alerts")
      .update({
        resolved_at: now,
        status: nextStatus,
        resolution_type: resolutionType,
        resolution_reason: resolutionReason
      })
      .eq("id", alertId)
      .eq("org_id", orgId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: resolutionType === "false_positive" ? "alert.false_positive" : "alert.resolved",
      entity_type: "alert",
      entity_id: alertId,
      metadata: {
        resolution_type: resolutionType,
        resolution_reason: resolutionReason,
        title: (existing as any).title,
        prev_status: (existing as any).status,
        revenue_recovered: revenueRecovered
      }
    });

    if (Number.isFinite(revenueRecovered) && (revenueRecovered as number) > 0) {
      await (supabase as any).from("revenue_recovery_events").insert({
        org_id: orgId,
        alert_id: alertId,
        amount: revenueRecovered,
        currency: recoveryCurrency,
        notes: `Recorded during alert ${resolutionType}`,
        recorded_by_user_id: user.id,
        recorded_at: now
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

