import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: report, error } = await supabase
      .from("reports")
      .select("id,metadata,name,report_type,last_output_path")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const metadata = (report as any).metadata ?? {};
    const bucket = String(metadata.bucket ?? "reports");
    const path = String((report as any).last_output_path ?? metadata.path ?? "");
    if (!path) return NextResponse.json({ error: "Report has no file" }, { status: 400 });

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: signed, error: sErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

