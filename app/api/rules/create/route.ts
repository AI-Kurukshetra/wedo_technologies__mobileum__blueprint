import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

const severityValues = new Set(["low", "medium", "high", "critical"] as const);
const statusValues = new Set(["draft", "enabled", "disabled"] as const);
const dimensionValues = new Set(["destination_country", "account_id", "carrier_id", "a_party"] as const);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const name = String(body?.name ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const severity = String(body?.severity ?? "medium").trim();
    const status = String(body?.status ?? "draft").trim();
    const windowMinutesRaw = Number(body?.windowMinutes ?? 15);
    const dimensionType = String(body?.dimensionType ?? "destination_country").trim();
    const dedupMinutesRaw = body?.dedup_minutes != null ? Number(body.dedup_minutes) : 60;

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!severityValues.has(severity as any)) return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
    if (!statusValues.has(status as any)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (!Number.isFinite(windowMinutesRaw) || windowMinutesRaw < 1 || windowMinutesRaw > 1440) {
      return NextResponse.json({ error: "Invalid windowMinutes" }, { status: 400 });
    }
    if (!dimensionValues.has(dimensionType as any)) return NextResponse.json({ error: "Invalid dimensionType" }, { status: 400 });
    if (!Number.isFinite(dedupMinutesRaw) || dedupMinutesRaw < 1 || dedupMinutesRaw > 24 * 60) {
      return NextResponse.json({ error: "Invalid dedup_minutes" }, { status: 400 });
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

    const conditions = body?.conditions && typeof body.conditions === "object" ? body.conditions : { thresholds: [] };

    const { data: rule, error: rErr } = await supabase
      .from("fraud_rules")
      .insert({
        org_id: orgId,
        name,
        description,
        status,
        severity,
        window_minutes: Math.round(windowMinutesRaw),
        dimension_type: dimensionType,
        conditions,
        dedup_minutes: Math.round(dedupMinutesRaw),
        created_by_user_id: user.id,
        updated_by_user_id: user.id
      })
      .select("id,org_id")
      .single();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });

    const { data: v, error: vErr } = await supabase.from("fraud_rule_versions").insert({
      org_id: rule.org_id,
      rule_id: rule.id,
      version: 1,
      snapshot: rule,
      created_by_user_id: user.id
    });
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, id: rule.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
