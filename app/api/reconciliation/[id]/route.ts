import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams, 200, 1000);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rec, error: recErr } = await (supabase as any)
      .from("reconciliations")
      .select("id,name,source_a,source_b,period_start,period_end,status,metrics,metadata,created_at,updated_at")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 400 });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rows, error: rErr } = await (supabase as any)
      .from("reconciliation_results")
      .select("id,status,match_key,source_a_value,source_b_value,delta,payload,created_at")
      .eq("org_id", orgId)
      .eq("reconciliation_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });

    return NextResponse.json({
      data: {
        reconciliation: rec,
        mismatches: rows ?? []
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
