import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { parseDateRange, parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { fromIso, toIso } = parseDateRange(url.searchParams);
    const limit = parseLimit(url.searchParams, 500, 5000);
    const q = (url.searchParams.get("q") ?? "").trim();

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [] });

    let query = supabase
      .from("cdr_records")
      .select("call_start_at,duration_seconds,a_party,b_party,destination_country,account_id,revenue_amount,cost_amount,carrier_id")
      .eq("org_id", orgId)
      .gte("call_start_at", fromIso)
      .lte("call_start_at", toIso)
      .order("call_start_at", { ascending: false })
      .limit(limit);

    if (q) {
      const cleaned = q.replaceAll(",", " ");
      const pattern = `%${cleaned}%`;
      query = query.or(
        [
          `account_id.ilike.${pattern}`,
          `destination_country.ilike.${pattern}`,
          `carrier_id.ilike.${pattern}`,
          `a_party.ilike.${pattern}`,
          `b_party.ilike.${pattern}`
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

