import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams, 200, 500);
    const q = (url.searchParams.get("q") ?? "").trim();

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [] });

    let query = supabase
      .from("networks")
      .select("id,org_id,name,mcc,mnc,country_code,network_code,metadata,created_at,updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      const pattern = `%${q.replaceAll(",", " ")}%`;
      query = query.or([`name.ilike.${pattern}`, `mcc.ilike.${pattern}`, `mnc.ilike.${pattern}`, `network_code.ilike.${pattern}`].join(","));
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const name = String(body?.name ?? "").trim();
    const mcc = body?.mcc != null ? String(body.mcc).trim() : null;
    const mnc = body?.mnc != null ? String(body.mnc).trim() : null;
    const countryCode = body?.country_code != null ? String(body.country_code).trim() : null;
    const networkCode = body?.network_code != null ? String(body.network_code).trim() : null;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { data, error } = await supabase
      .from("networks")
      .insert({ org_id: orgId, name, mcc, mnc, country_code: countryCode, network_code: networkCode })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

