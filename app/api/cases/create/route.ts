import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

const severityValues = new Set(["low", "medium", "high", "critical"] as const);
const statusValues = new Set(["open", "in_review", "closed"] as const);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const title = String(body?.title ?? "").trim();
    const severity = String(body?.severity ?? "medium").trim();
    const status = String(body?.status ?? "open").trim();
    const alertId = body?.alertId ? String(body.alertId).trim() : null;

    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!severityValues.has(severity as any)) return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
    if (!statusValues.has(status as any)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { data, error } = await supabase
      .from("cases")
      .insert({
        org_id: orgId,
        title,
        status,
        severity,
        description: "",
        created_by_user_id: user.id,
        owner_user_id: null
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const caseId = data?.id ?? null;

    if (alertId && caseId) {
      const { data: alertRow, error: aErr } = await supabase
        .from("alerts")
        .select("id")
        .eq("id", alertId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
      if (alertRow) {
        const { error: linkErr } = await supabase.from("case_alerts").insert({ org_id: orgId, case_id: caseId, alert_id: alertId });
        if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
