import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const roleValues = new Set(["admin", "manager", "analyst", "read_only"] as const);

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as any;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const orgId = String(body?.orgId ?? "").trim();
    const role = String(body?.role ?? "analyst").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }
    if (!roleValues.has(role as any)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: membership, error: mErr } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 403 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (membership.role !== "admin") return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: inviteRes, error: iErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
    const invitedUserId = inviteRes.user?.id;
    if (!invitedUserId) return NextResponse.json({ error: "Invite failed" }, { status: 400 });

    const { error: upErr } = await supabaseAdmin.from("org_memberships").upsert(
      {
        org_id: orgId,
        user_id: invitedUserId,
        role
      },
      { onConflict: "org_id,user_id" }
    );
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, invitedUserId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

