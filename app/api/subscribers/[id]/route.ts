import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

function isValidMsisdn(value: string) {
  return /^\+?[0-9]{8,20}$/.test(value);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("subscribers")
      .select("id,org_id,msisdn,imsi,imei,status,metadata,created_at,updated_at")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as any;

    const patch: any = {};
    if (body?.msisdn != null) {
      const msisdn = String(body.msisdn).trim();
      if (!msisdn) return NextResponse.json({ error: "msisdn cannot be empty" }, { status: 400 });
      if (!isValidMsisdn(msisdn)) return NextResponse.json({ error: "msisdn must be a valid phone number" }, { status: 400 });
      patch.msisdn = msisdn;
    }
    if (body?.imsi !== undefined) patch.imsi = body.imsi == null ? null : String(body.imsi).trim();
    if (body?.imei !== undefined) patch.imei = body.imei == null ? null : String(body.imei).trim();
    if (body?.status != null) patch.status = String(body.status).trim();
    if (body?.metadata !== undefined) patch.metadata = body.metadata ?? {};

    if (!Object.keys(patch).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { error } = await supabase.from("subscribers").update(patch).eq("id", id).eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { error } = await supabase.from("subscribers").delete().eq("id", id).eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
