import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser } from "@/lib/api/rbac";
import { parseLimit } from "@/lib/api/date-range";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams, 100, 300);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ data: [] });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    if (role !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    const { data: memberships, error } = await supabase
      .from("org_memberships")
      .select("user_id,role,created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const supabaseAdmin = createSupabaseAdminClient();
    const users = await Promise.all(
      (memberships ?? []).map(async (m: any) => {
        const userId = String(m.user_id);
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId).catch(() => ({ data: null as any }));
        const email = u?.user?.email ?? null;
        return { userId, email, role: String(m.role ?? ""), createdAt: String(m.created_at ?? "") };
      })
    );

    return NextResponse.json({ data: users });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

