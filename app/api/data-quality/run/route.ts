import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { runDataQualityChecks } from "@/lib/data-quality/checks";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const periodStartRaw = body?.periodStart ? String(body.periodStart).trim() : "";
    const periodEndRaw = body?.periodEnd ? String(body.periodEnd).trim() : "";

    const to = periodEndRaw ? new Date(periodEndRaw) : new Date();
    const from = periodStartRaw ? new Date(periodStartRaw) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
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

    const result = await runDataQualityChecks({
      supabase: supabase as any,
      orgId,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      actorUserId: user.id
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
