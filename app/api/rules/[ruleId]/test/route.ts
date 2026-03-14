import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { evaluateSingleRule, getSupportedRuleType } from "@/lib/rules/engine";

export async function POST(req: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;
    const from = String(body?.from ?? "").trim();
    const to = String(body?.to ?? "").trim();
    const limitRaw = body?.limit != null ? Number(body.limit) : 5000;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 50000) : 5000;

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (!fromDate || Number.isNaN(fromDate.getTime())) return NextResponse.json({ error: "Invalid from" }, { status: 400 });
    if (!toDate || Number.isNaN(toDate.getTime())) return NextResponse.json({ error: "Invalid to" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rule, error: rErr } = await supabase
      .from("fraud_rules")
      .select("id,org_id,name,status,severity,window_minutes,dimension_type,conditions,dedup_minutes")
      .eq("id", ruleId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const type = getSupportedRuleType((rule as any).conditions);
    if (!type) return NextResponse.json({ error: "Unsupported rule_type in conditions" }, { status: 400 });

    const { data: versions, error: vErr } = await supabase
      .from("fraud_rule_versions")
      .select("id,version")
      .eq("org_id", orgId)
      .eq("rule_id", ruleId)
      .order("version", { ascending: false })
      .limit(1);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });
    const versionId = versions?.[0]?.id ?? null;
    if (!versionId) return NextResponse.json({ error: "Rule has no versions" }, { status: 400 });

    const { data: cdrs, error: cErr } = await supabase
      .from("cdr_records")
      .select("id,org_id,call_start_at,duration_seconds,a_party,b_party,destination_country,account_id,carrier_id,revenue_amount,cost_amount,source_row_hash")
      .eq("org_id", orgId)
      .gte("call_start_at", fromDate.toISOString())
      .lte("call_start_at", toDate.toISOString())
      .limit(limit);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    const alerts = evaluateSingleRule({
      type,
      rule: rule as any,
      ruleVersionId: versionId,
      windowStart: fromDate,
      windowEnd: toDate,
      cdrRows: (cdrs ?? []) as any
    });

    const matches = alerts.map((a) => ({
      dimensionValue: a.dimension_value,
      stats: a.evidence,
      why: a.title
    }));

    return NextResponse.json({ ok: true, data: { matches } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

