import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser } from "@/lib/api/rbac";

export async function GET(_req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [] });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    if (role !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    const { data, error } = await supabase
      .from("system_metrics")
      .select("key,value,unit,metadata,recorded_at,updated_at")
      .eq("org_id", orgId)
      .order("key", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

