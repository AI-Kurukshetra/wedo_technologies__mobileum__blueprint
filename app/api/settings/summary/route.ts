import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) {
      return NextResponse.json({
        data: { orgId: null, memberCount: 0, myRole: null, policy: null }
      });
    }

    const { data: me, error: meErr } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });

    const { count, error: countErr } = await supabase
      .from("org_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 400 });

    const { data: policies, error: pErr } = await supabase
      .from("notification_policies")
      .select("id,email_recipients,webhook_urls,enabled,min_severity")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

    const policy = policies?.[0] ?? null;

    return NextResponse.json({
      data: { orgId, memberCount: count ?? 0, myRole: me?.role ?? null, policy }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
