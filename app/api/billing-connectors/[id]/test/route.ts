import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { testConnector } from "@/lib/billing-connectors";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as any;
    const fromRaw = body?.from ? String(body.from).trim() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const toRaw = body?.to ? String(body.to).trim() : new Date().toISOString();
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid from or to" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data: connector, error } = await (supabase as any)
      .from("billing_connectors")
      .select("id,connector_type,config")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!connector) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      const result = await testConnector({
        connectorType: String((connector as any).connector_type) as any,
        config: ((connector as any).config ?? {}) as any,
        fromIso: from.toISOString(),
        toIso: to.toISOString()
      });

      await (supabase as any)
        .from("billing_connectors")
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "ok",
          last_test_error: null,
          updated_by_user_id: user.id
        })
        .eq("org_id", orgId)
        .eq("id", id);

      return NextResponse.json({ ok: true, data: result });
    } catch (e: any) {
      await (supabase as any)
        .from("billing_connectors")
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "failed",
          last_test_error: e?.message ?? "Connector test failed",
          updated_by_user_id: user.id
        })
        .eq("org_id", orgId)
        .eq("id", id);
      return NextResponse.json({ error: e?.message ?? "Connector test failed" }, { status: 400 });
    }
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
