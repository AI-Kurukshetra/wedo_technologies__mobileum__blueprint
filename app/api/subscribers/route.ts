import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { parseLimit } from "@/lib/api/date-range";

function isValidMsisdn(value: string) {
  // simple E.164-ish check; allow + and digits
  return /^\+?[0-9]{8,20}$/.test(value);
}

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
      .from("subscribers")
      .select("id,org_id,msisdn,imsi,imei,status,metadata,created_at,updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      const pattern = `%${q.replaceAll(",", " ")}%`;
      query = query.or([`msisdn.ilike.${pattern}`, `imsi.ilike.${pattern}`, `imei.ilike.${pattern}`].join(","));
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
    const msisdn = String(body?.msisdn ?? "").trim();
    const imsi = body?.imsi != null ? String(body.imsi).trim() : null;
    const imei = body?.imei != null ? String(body.imei).trim() : null;
    const status = String(body?.status ?? "active").trim();

    if (!msisdn) return NextResponse.json({ error: "msisdn is required" }, { status: 400 });
    if (!isValidMsisdn(msisdn)) return NextResponse.json({ error: "msisdn must be a valid phone number" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { data, error } = await supabase
      .from("subscribers")
      .insert({ org_id: orgId, msisdn, imsi, imei, status })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

