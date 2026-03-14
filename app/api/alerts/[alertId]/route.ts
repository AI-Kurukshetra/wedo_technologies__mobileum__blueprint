import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function GET(_req: Request, ctx: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("alerts")
      .select(
        [
          "id,org_id,rule_id,rule_version_id,status,severity,title,dedup_key,window_start_at,window_end_at,dimension_type,dimension_value,evidence,assigned_to_user_id,acknowledged_at,resolved_at,resolution_type,resolution_reason,notified_at,created_at",
          "fraud_rules(name)"
        ].join(",")
      )
      .eq("id", alertId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const row = data as Record<string, any>;
    const ruleName = row?.fraud_rules?.name ?? null;

    return NextResponse.json({
      data: {
        ...row,
        rule_name: ruleName
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
