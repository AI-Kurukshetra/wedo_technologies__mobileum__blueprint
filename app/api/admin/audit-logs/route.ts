import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser } from "@/lib/api/rbac";
import { parseDateRange, parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { fromIso, toIso } = parseDateRange(url.searchParams);
    const limit = parseLimit(url.searchParams, 100, 500);
    const entityType = (url.searchParams.get("entity_type") ?? "").trim();
    const action = (url.searchParams.get("action") ?? "").trim();

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [] });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    if (role !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    let query = supabase
      .from("audit_log")
      .select("id,created_at,actor_user_id,action,entity_type,entity_id,metadata")
      .eq("org_id", orgId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq("entity_type", entityType);
    if (action) query = query.ilike("action", `%${action}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

