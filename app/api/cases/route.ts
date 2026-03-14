import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { parseDateRange, parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { fromIso, toIso } = parseDateRange(url.searchParams);
    const limit = parseLimit(url.searchParams, 200, 500);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [] });

    const { data, error } = await supabase
      .from("cases")
      .select("id,title,status,severity,owner_user_id,updated_at")
      .eq("org_id", orgId)
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const cases = data ?? [];
    const ids = cases.map((c) => c.id);
    let counts: Record<string, number> = {};

    if (ids.length) {
      const { data: links, error: lErr } = await supabase.from("case_alerts").select("case_id").in("case_id", ids);
      if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });
      for (const row of links ?? []) {
        const key = String((row as any).case_id);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }

    return NextResponse.json({ data: cases.map((c: any) => ({ ...c, alerts_count: counts[String(c.id)] ?? 0 })) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
