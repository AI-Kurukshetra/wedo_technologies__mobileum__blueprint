import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const originalFilename = String(body?.originalFilename ?? "").trim();
    const total = Number(body?.total ?? 0);
    const failed = Number(body?.failed ?? 0);
    const storageObjectPath = String(body?.storageObjectPath ?? "").trim();

    if (!originalFilename) return NextResponse.json({ error: "originalFilename is required" }, { status: 400 });
    if (!Number.isFinite(total) || total < 0) return NextResponse.json({ error: "Invalid total" }, { status: 400 });
    if (!Number.isFinite(failed) || failed < 0) return NextResponse.json({ error: "Invalid failed" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data, error } = await supabase
      .from("cdr_imports")
      .insert({
        org_id: orgId,
        uploaded_by_user_id: user.id,
        status: "processing",
        source: "csv_upload",
        original_filename: originalFilename,
        storage_object_path: storageObjectPath || `uploads/${orgId}/${crypto.randomUUID()}/${originalFilename}`,
        started_at: new Date().toISOString(),
        row_count_total: Math.round(total),
        row_count_ok: 0,
        row_count_failed: Math.round(failed)
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, importId: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
