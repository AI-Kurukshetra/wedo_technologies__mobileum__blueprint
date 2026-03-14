import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { listConnectorDefinitions } from "@/lib/billing-connectors";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [], definitions: listConnectorDefinitions() });

    const { data, error } = await (supabase as any)
      .from("billing_connectors")
      .select("id,name,connector_type,enabled,config,last_tested_at,last_test_status,last_test_error,created_at,updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data ?? [], definitions: listConnectorDefinitions() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const name = String(body?.name ?? "").trim();
    const connectorType = String(body?.connectorType ?? "").trim();
    const enabled = body?.enabled == null ? true : Boolean(body.enabled);
    const config = typeof body?.config === "object" && body?.config ? body.config : {};

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!connectorType) return NextResponse.json({ error: "connectorType is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data, error } = await (supabase as any)
      .from("billing_connectors")
      .insert({
        org_id: orgId,
        name,
        connector_type: connectorType,
        enabled,
        config,
        created_by_user_id: user.id,
        updated_by_user_id: user.id
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await (supabase as any).from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "billing_connector.created",
      entity_type: "billing_connector",
      entity_id: data.id,
      metadata: { name, connectorType }
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}
