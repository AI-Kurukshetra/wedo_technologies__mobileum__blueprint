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
      .from("partners")
      .select("id,org_id,name,partner_type,country_code,contact_email,contact_phone,metadata,created_at,updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      const pattern = `%${q.replaceAll(",", " ")}%`;
      query = query.or([`name.ilike.${pattern}`, `partner_type.ilike.${pattern}`, `country_code.ilike.${pattern}`, `contact_email.ilike.${pattern}`].join(","));
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
    const partnerType = String(body?.partner_type ?? "carrier").trim();
    const countryCode = body?.country_code != null ? String(body.country_code).trim() : null;
    const contactEmail = body?.contact_email != null ? String(body.contact_email).trim() : null;
    const contactPhone = body?.contact_phone != null ? String(body.contact_phone).trim() : null;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { data, error } = await supabase
      .from("partners")
      .insert({
        org_id: orgId,
        name,
        partner_type: partnerType,
        country_code: countryCode,
        contact_email: contactEmail,
        contact_phone: contactPhone
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

