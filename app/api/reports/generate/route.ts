import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { generateAndStoreReport, supportedReportTypes, type ReportType } from "@/lib/reports/generator";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const type = String(body?.type ?? "").trim() as ReportType;
    const fromIso = String(body?.from ?? "").trim();
    const toIso = String(body?.to ?? "").trim();
    const name = body?.name != null ? String(body.name).trim() : "";

    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);
    if (!supportedReportTypes.has(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    if (!fromIso || Number.isNaN(fromDate.getTime())) return NextResponse.json({ error: "Invalid from" }, { status: 400 });
    if (!toIso || Number.isNaN(toDate.getTime())) return NextResponse.json({ error: "Invalid to" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const out = await generateAndStoreReport({
      supabase: supabase as any,
      orgId,
      actorUserId: user.id,
      type,
      fromIso: fromDate.toISOString(),
      toIso: toDate.toISOString(),
      name: name || undefined
    });

    return NextResponse.json({ ok: true, id: out.id });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
