import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDateRange } from "@/lib/api/date-range";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { fromIso, toIso } = parseDateRange(url.searchParams);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.rpc("dashboard_kpis", { from_ts: fromIso, to_ts: toIso }).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);

    let recovered = 0;
    if (orgId) {
      const { data: recoveryRows, error: recoveryErr } = await (supabase as any)
        .from("revenue_recovery_events")
        .select("amount")
        .eq("org_id", orgId)
        .gte("recorded_at", fromIso)
        .lte("recorded_at", toIso)
        .limit(100000);
      if (!recoveryErr) {
        recovered = (recoveryRows ?? []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
      }
    }

    return NextResponse.json({ data: { ...(data ?? {}), revenue_recovered: recovered } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

