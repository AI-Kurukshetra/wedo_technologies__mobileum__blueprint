import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

type Row = {
  sourceRowNumber: number;
  sourceRowHash: string;
  callStartAt: string;
  durationSeconds: number;
  aParty: string | null;
  bParty: string | null;
  destinationCountry: string | null;
  accountId: string | null;
  carrierId: string | null;
  revenueAmount: number | null;
  costAmount: number | null;
  raw: Record<string, any>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const importId = String(body?.importId ?? "").trim();
    const rows = Array.isArray(body?.rows) ? (body.rows as Row[]) : [];

    if (!importId) return NextResponse.json({ error: "importId is required" }, { status: 400 });
    if (!rows.length) return NextResponse.json({ ok: true, inserted: 0 });
    if (rows.length > 1000) return NextResponse.json({ error: "Too many rows per request" }, { status: 413 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data: imp, error: iErr } = await supabase.from("cdr_imports").select("id,org_id").eq("id", importId).maybeSingle();
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
    if (!imp || String((imp as any).org_id) !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const payload = rows.map((r) => {
      const start = new Date(r.callStartAt);
      const callStartAt = Number.isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString();
      const dur = Number.isFinite(r.durationSeconds) ? Math.max(0, Math.round(r.durationSeconds)) : 0;
      const callEndAt = new Date(new Date(callStartAt).getTime() + dur * 1000).toISOString();

      return {
        org_id: orgId,
        import_id: importId,
        source_row_number: Math.round(Number(r.sourceRowNumber ?? 0)) || null,
        source_row_hash: String(r.sourceRowHash ?? crypto.randomUUID()),
        call_start_at: callStartAt,
        call_end_at: callEndAt,
        duration_seconds: dur,
        a_party: r.aParty ?? null,
        b_party: r.bParty ?? null,
        destination_country: r.destinationCountry ?? null,
        account_id: r.accountId ?? null,
        carrier_id: r.carrierId ?? null,
        revenue_amount: r.revenueAmount ?? null,
        cost_amount: r.costAmount ?? null,
        currency: "USD",
        raw: r.raw ?? {}
      };
    });

    const { error: insErr } = await supabase.from("cdr_records").insert(payload);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, inserted: payload.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
