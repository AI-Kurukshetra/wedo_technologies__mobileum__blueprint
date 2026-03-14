import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { parseDateRange } from "@/lib/api/date-range";

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { fromIso, toIso } = parseDateRange(url.searchParams);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: { totalRecovered: 0, totalEvents: 0, byDay: [] } });

    const { data, error } = await (supabase as any)
      .from("revenue_recovery_events")
      .select("amount,recorded_at")
      .eq("org_id", orgId)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .limit(100000);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const byDayMap = new Map<string, number>();
    let totalRecovered = 0;
    for (const row of data ?? []) {
      const day = String((row as any).recorded_at ?? "").slice(0, 10);
      const amount = toNumber((row as any).amount);
      totalRecovered += amount;
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + amount);
    }
    const byDay = Array.from(byDayMap.entries()).map(([day, amount]) => ({ day, amount }));

    return NextResponse.json({
      data: {
        totalRecovered,
        totalEvents: (data ?? []).length,
        byDay
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
