import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { runReconciliation } from "@/lib/reconciliation/engine";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const sourceA = String(body?.sourceA ?? "").trim();
    const sourceB = String(body?.sourceB ?? "").trim();
    const periodStart = String(body?.periodStart ?? "").trim();
    const periodEnd = String(body?.periodEnd ?? "").trim();
    const options = typeof body?.options === "object" && body?.options ? body.options : {};

    if (!sourceA || !sourceB) return NextResponse.json({ error: "sourceA and sourceB are required" }, { status: 400 });
    const from = new Date(periodStart);
    const to = new Date(periodEnd);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid periodStart or periodEnd" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const result = await runReconciliation({
      supabase: supabase as any,
      actorUserId: user.id,
      request: {
        orgId,
        sourceA,
        sourceB,
        periodStart: from.toISOString(),
        periodEnd: to.toISOString(),
        options
      }
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
