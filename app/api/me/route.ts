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
        user: { id: user.id, email: user.email ?? null },
        org: null,
        membership: null
      });
    }

    const { data: org, error: oErr } = await supabase.from("orgs").select("id,name,slug").eq("id", orgId).maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 400 });

    const { data: membership, error: mErr } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });

    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
      org: org ? { id: org.id, name: (org as any).name, slug: (org as any).slug } : null,
      membership: membership ? { role: (membership as any).role } : null
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

