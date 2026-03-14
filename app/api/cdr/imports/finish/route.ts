import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { sha256Hex } from "@/lib/pipeline/dedup";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const importId = String(body?.importId ?? "").trim();
    const ok = Number(body?.ok ?? 0);
    const failed = Number(body?.failed ?? 0);

    if (!importId) return NextResponse.json({ error: "importId is required" }, { status: 400 });
    if (!Number.isFinite(ok) || ok < 0) return NextResponse.json({ error: "Invalid ok" }, { status: 400 });
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

    const { data: imp, error: iErr } = await supabase.from("cdr_imports").select("id,org_id").eq("id", importId).maybeSingle();
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
    if (!imp || String((imp as any).org_id) !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabase
      .from("cdr_imports")
      .update({
        status: "processed",
        finished_at: new Date().toISOString(),
        row_count_ok: Math.round(ok),
        row_count_failed: Math.round(failed)
      })
      .eq("id", importId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Enqueue pipeline event (best-effort): update aggregates + evaluate rules + send notifications.
    const { data: minRow } = await (supabase as any)
      .from("cdr_records")
      .select("call_start_at")
      .eq("org_id", orgId)
      .eq("import_id", importId)
      .order("call_start_at", { ascending: true })
      .limit(1);
    const { data: maxRow } = await (supabase as any)
      .from("cdr_records")
      .select("call_start_at")
      .eq("org_id", orgId)
      .eq("import_id", importId)
      .order("call_start_at", { ascending: false })
      .limit(1);

    const fromIso = String((minRow?.[0] as any)?.call_start_at ?? new Date().toISOString());
    const toIso = String((maxRow?.[0] as any)?.call_start_at ?? new Date().toISOString());
    const dedupKey = sha256Hex(`${importId}|${Math.round(ok)}|${Math.round(failed)}|${fromIso}|${toIso}`);

    const { error: peErr } = await (supabase as any).from("pipeline_events").insert({
      org_id: orgId,
      event_type: "cdr.ingested",
      dedup_key: dedupKey,
      payload: {
        source: "csv_import",
        importId,
        fromIso,
        toIso,
        attemptedRows: Math.round(ok) + Math.round(failed),
        errors: Math.round(failed)
      }
    });
    if (peErr) {
      await (supabase as any).from("audit_log").insert({
        org_id: orgId,
        actor_user_id: user.id,
        action: "pipeline.enqueue_failed",
        entity_type: "pipeline_event",
        entity_id: null,
        metadata: { error: peErr.message, event_type: "cdr.ingested", importId }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
