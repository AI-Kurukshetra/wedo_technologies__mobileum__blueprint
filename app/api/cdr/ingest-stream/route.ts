import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";
import { getOrgRoleForUser, requireWriteRole } from "@/lib/api/rbac";
import { runRuleEvaluation } from "@/lib/rules/engine";
import { computeCdrBatchDedupKey } from "@/lib/pipeline/dedup";

type IngestCdr = {
  call_start_at: string;
  duration_seconds: number;
  a_party: string;
  b_party: string;
  destination_country?: string | null;
  account_id?: string | null;
  carrier_id?: string | null;
  revenue_amount?: number | null;
  cost_amount?: number | null;
  raw?: Record<string, any> | null;
};

function normalizeCountry(value: unknown) {
  const s = value == null ? "" : String(value).trim().toUpperCase();
  if (!s) return null;
  const cleaned = s.replaceAll(/[^A-Z]/g, "");
  return cleaned.length >= 2 ? cleaned.slice(0, 2) : null;
}

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stableHash(row: {
  call_start_at: string;
  duration_seconds: number;
  a_party: string;
  b_party: string;
  destination_country: string | null;
  account_id: string | null;
  carrier_id: string | null;
  revenue_amount: number | null;
  cost_amount: number | null;
}) {
  const key = JSON.stringify(row);
  return createHash("sha256").update(key).digest("hex");
}

async function getOrCreateStreamImport(params: { supabase: any; orgId: string; userId: string }) {
  const { data: existing, error: eErr } = await params.supabase
    .from("cdr_imports")
    .select("id,created_at,started_at,status")
    .eq("org_id", params.orgId)
    .eq("source", "ingest_stream")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eErr) throw eErr;

  const recentId = existing?.id ? String(existing.id) : null;
  const recentCreatedAt = existing?.created_at ? new Date(String(existing.created_at)) : null;
  const isRecent = recentCreatedAt && !Number.isNaN(recentCreatedAt.getTime()) && Date.now() - recentCreatedAt.getTime() < 24 * 60 * 60 * 1000;
  if (recentId && isRecent) return recentId;

  const nowIso = new Date().toISOString();
  const { data: created, error: cErr } = await params.supabase
    .from("cdr_imports")
    .insert({
      org_id: params.orgId,
      uploaded_by_user_id: params.userId,
      status: "processing",
      source: "ingest_stream",
      original_filename: null,
      storage_object_path: `stream/${params.orgId}/${nowIso.slice(0, 10)}`,
      started_at: nowIso,
      row_count_total: 0,
      row_count_ok: 0,
      row_count_failed: 0
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  return String(created.id);
}

export async function POST(req: Request) {
  try {
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
    const max = 50_000;
    const autoEvaluate = String(req.headers.get("x-auto-evaluate") ?? "false").toLowerCase() === "true";

    let inputRows: any[] = [];
    if (contentType.includes("application/x-ndjson") || contentType.includes("application/ndjson") || contentType.includes("text/plain")) {
      const text = await req.text();
      inputRows = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, max)
        .map((line) => JSON.parse(line));
    } else {
      const body = (await req.json().catch(() => null)) as any;
      inputRows = Array.isArray(body) ? body.slice(0, max) : Array.isArray(body?.rows) ? body.rows.slice(0, max) : [];
    }

    if (!inputRows.length) return NextResponse.json({ ok: true, inserted: 0, errors: [] });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const role = await getOrgRoleForUser({ supabase: supabase as any, orgId, userId: user.id });
    requireWriteRole(role);

    const importId = await getOrCreateStreamImport({ supabase: supabase as any, orgId, userId: user.id });

    const errors: Array<{ index: number; message: string }> = [];
    const normalized: Array<Record<string, any>> = [];
    const rowHashes: string[] = [];
    let minCallStartMs: number | null = null;
    let maxCallStartMs: number | null = null;

    for (let i = 0; i < inputRows.length; i++) {
      const row = inputRows[i] as Partial<IngestCdr>;
      const callStartRaw = (row as any)?.call_start_at ?? (row as any)?.started_at ?? (row as any)?.callStartAt;
      const aPartyRaw = (row as any)?.a_party ?? (row as any)?.aParty ?? (row as any)?.caller_number ?? (row as any)?.from;
      const bPartyRaw = (row as any)?.b_party ?? (row as any)?.bParty ?? (row as any)?.callee_number ?? (row as any)?.to;
      const durationRaw = (row as any)?.duration_seconds ?? (row as any)?.durationSeconds ?? (row as any)?.duration;

      const callStart = new Date(String(callStartRaw ?? ""));
      if (Number.isNaN(callStart.getTime())) {
        errors.push({ index: i, message: "Invalid call_start_at" });
        continue;
      }

      const duration = Math.max(0, Math.round(toNumber(durationRaw) ?? 0));
      const aParty = String(aPartyRaw ?? "").trim();
      const bParty = String(bPartyRaw ?? "").trim();
      if (!aParty || !bParty) {
        errors.push({ index: i, message: "Missing a_party or b_party" });
        continue;
      }

      const destinationCountry = normalizeCountry((row as any)?.destination_country ?? (row as any)?.destinationCountry);
      const accountId = ((row as any)?.account_id ?? (row as any)?.accountId) != null ? String((row as any).account_id ?? (row as any).accountId).trim() : null;
      const carrierId = ((row as any)?.carrier_id ?? (row as any)?.carrierId) != null ? String((row as any).carrier_id ?? (row as any).carrierId).trim() : null;

      const revenue = toNumber((row as any)?.revenue_amount ?? (row as any)?.revenueAmount ?? (row as any)?.revenue);
      const cost = toNumber((row as any)?.cost_amount ?? (row as any)?.costAmount ?? (row as any)?.cost);

      const callStartIso = callStart.toISOString();
      const callEndIso = new Date(callStart.getTime() + duration * 1000).toISOString();

      const hash = stableHash({
        call_start_at: callStartIso,
        duration_seconds: duration,
        a_party: aParty,
        b_party: bParty,
        destination_country: destinationCountry,
        account_id: accountId,
        carrier_id: carrierId,
        revenue_amount: revenue,
        cost_amount: cost
      });

      rowHashes.push(hash);
      const csMs = callStart.getTime();
      minCallStartMs = minCallStartMs == null ? csMs : Math.min(minCallStartMs, csMs);
      maxCallStartMs = maxCallStartMs == null ? csMs : Math.max(maxCallStartMs, csMs);

      normalized.push({
        org_id: orgId,
        import_id: importId,
        source_row_number: null,
        source_row_hash: hash,
        call_start_at: callStartIso,
        call_end_at: callEndIso,
        duration_seconds: duration,
        a_party: aParty,
        b_party: bParty,
        destination_country: destinationCountry,
        account_id: accountId,
        carrier_id: carrierId,
        revenue_amount: revenue,
        cost_amount: cost,
        currency: "USD",
        raw: (row as any)?.raw && typeof (row as any).raw === "object" ? (row as any).raw : row
      });
    }

    if (!normalized.length) return NextResponse.json({ ok: true, inserted: 0, errors });

    const batchSize = 1000;
    let inserted = 0;
    for (let offset = 0; offset < normalized.length; offset += batchSize) {
      const slice = normalized.slice(offset, offset + batchSize);
      const { error: insErr } = await (supabase as any)
        .from("cdr_records")
        .upsert(slice, { onConflict: "import_id,source_row_hash", ignoreDuplicates: true });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
      inserted += slice.length;
    }

    await (supabase as any)
      .from("cdr_imports")
      .update({
        status: "processed",
        row_count_total: normalized.length,
        row_count_ok: normalized.length,
        row_count_failed: errors.length,
        finished_at: new Date().toISOString()
      })
      .eq("id", importId)
      .eq("org_id", orgId);

    // Enqueue a pipeline event for downstream real-time processing (aggregation/rules/notifications).
    // Idempotent: unique (org_id,event_type,dedup_key).
    const fromIso = minCallStartMs == null ? new Date().toISOString() : new Date(minCallStartMs).toISOString();
    const toIso = maxCallStartMs == null ? new Date().toISOString() : new Date(maxCallStartMs).toISOString();
    const dedupKey = computeCdrBatchDedupKey({ importId, rowHashes, fromIso, toIso });

    const { error: peErr } = await (supabase as any).from("pipeline_events").insert({
      org_id: orgId,
      event_type: "cdr.ingested",
      dedup_key: dedupKey,
      payload: {
        source: "ingest_stream",
        importId,
        fromIso,
        toIso,
        attemptedRows: normalized.length,
        errors: errors.length
      }
    });
    if (peErr) {
      // Do not fail ingestion if the pipeline enqueue fails; the periodic jobs still run as a fallback.
      // Best-effort audit entry for visibility.
      await (supabase as any).from("audit_log").insert({
        org_id: orgId,
        actor_user_id: user.id,
        action: "pipeline.enqueue_failed",
        entity_type: "pipeline_event",
        entity_id: null,
        metadata: { error: peErr.message, event_type: "cdr.ingested", importId }
      });
    }

    let evaluation: any = null;
    if (autoEvaluate && inserted > 0) {
      try {
        evaluation = await runRuleEvaluation({ supabase: supabase as any, orgId });
      } catch (e: any) {
        evaluation = { error: e?.message ?? "Rule evaluation failed" };
      }
    }

    return NextResponse.json({ ok: true, importId, inserted, errors, evaluation });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
