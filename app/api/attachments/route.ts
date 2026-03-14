import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const caseId = String(body?.caseId ?? "").trim();
    const filename = String(body?.filename ?? "").trim();
    const contentType = body?.contentType ? String(body.contentType).trim() : null;

    if (!caseId) return NextResponse.json({ error: "caseId is required" }, { status: 400 });
    if (!filename) return NextResponse.json({ error: "filename is required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const { data: c, error: cErr } = await supabase.from("cases").select("id").eq("id", caseId).eq("org_id", orgId).maybeSingle();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const safeName = filename.replaceAll("/", "_").replaceAll("\\", "_");
    const objectPath = `org/${orgId}/cases/${caseId}/${Date.now()}-${safeName}`;

    // Insert attachment metadata row (RLS enforced)
    const { data: inserted, error: aErr } = await supabase
      .from("attachments")
      .insert({
        org_id: orgId,
        case_id: caseId,
        uploaded_by_user_id: user.id,
        storage_object_path: objectPath,
        filename: safeName,
        content_type: contentType,
        bytes: null
      })
      .select("id")
      .single();
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });

    const supabaseAdmin = createSupabaseAdminClient();
    const bucket = "case-attachments";

    const { data, error } = await (supabaseAdmin as any).storage.from(bucket).createSignedUploadUrl(objectPath);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      action: "attachment.created",
      entity_type: "attachment",
      entity_id: inserted?.id ?? null,
      metadata: { case_id: caseId, filename: safeName, bucket, path: objectPath }
    });

    return NextResponse.json({
      ok: true,
      attachmentId: inserted?.id ?? null,
      bucket,
      path: objectPath,
      token: data?.token ?? null,
      signedUrl: data?.signedUrl ?? data?.signed_url ?? null
    });
  } catch (e: any) {
    const status = (e as any)?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status });
  }
}

