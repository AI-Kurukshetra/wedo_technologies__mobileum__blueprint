import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as any;

    const patch: any = {};
    if (body?.name != null) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      patch.name = name;
    }
    if (body?.mcc !== undefined) patch.mcc = body.mcc == null ? null : String(body.mcc).trim();
    if (body?.mnc !== undefined) patch.mnc = body.mnc == null ? null : String(body.mnc).trim();
    if (body?.country_code !== undefined) patch.country_code = body.country_code == null ? null : String(body.country_code).trim();
    if (body?.network_code !== undefined) patch.network_code = body.network_code == null ? null : String(body.network_code).trim();
    if (body?.metadata !== undefined) patch.metadata = body.metadata ?? {};

    if (!Object.keys(patch).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { error } = await supabase.from("networks").update(patch).eq("id", id).eq("org_id", orgId);
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

    const { error } = await supabase.from("networks").delete().eq("id", id).eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

