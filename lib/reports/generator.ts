import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReportType =
  | "revenue_assurance"
  | "fraud_detection"
  | "roaming_activity"
  | "interconnect_revenue"
  | "regulatory_summary"
  | "compliance_audit"
  | "revenue_recovery";

export const supportedReportTypes = new Set<ReportType>([
  "revenue_assurance",
  "fraud_detection",
  "roaming_activity",
  "interconnect_revenue",
  "regulatory_summary",
  "compliance_audit",
  "revenue_recovery"
]);

function toCsvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toDateOnly(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function generateCsv(params: { supabase: any; orgId: string; type: ReportType; fromIso: string; toIso: string }) {
  const { type, fromIso, toIso } = params;

  if (type === "revenue_assurance") {
    const { data: kpis } = await params.supabase.rpc("dashboard_kpis", { from_ts: fromIso, to_ts: toIso });
    const { data: leakage } = await params.supabase.rpc("analytics_revenue_leakage", { from_ts: fromIso, to_ts: toIso });
    const { data: top } = await params.supabase.rpc("dashboard_top_destinations");
    const { data: recon } = await params.supabase
      .from("reconciliations")
      .select("status,metrics,created_at")
      .eq("org_id", params.orgId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(50);

    const lines: string[] = [];
    lines.push("section,key,value");
    lines.push(["kpis", "calls", (kpis?.calls ?? 0)].map(toCsvCell).join(","));
    lines.push(["kpis", "revenue", (kpis?.revenue ?? 0)].map(toCsvCell).join(","));
    lines.push(["kpis", "duration", (kpis?.duration ?? 0)].map(toCsvCell).join(","));
    lines.push(["kpis", "margin", (kpis?.margin ?? 0)].map(toCsvCell).join(","));
    lines.push("");
    lines.push("revenue_leakage_day,revenue,cost,margin,leakage,margin_pct");
    for (const r of (leakage?.series ?? []) as any[]) {
      lines.push([r.day, r.revenue, r.cost, r.margin, r.leakage, r.marginPct].map(toCsvCell).join(","));
    }
    lines.push("");
    lines.push("top_destinations,destination_country,calls,revenue");
    for (const r of (top ?? []) as any[]) {
      lines.push(["dest", r.destination_country, r.calls, r.revenue].map(toCsvCell).join(","));
    }
    lines.push("");
    lines.push("reconciliation_runs,created_at,status,matched,mismatched,delta");
    for (const r of recon ?? []) {
      const metrics = (r as any).metrics ?? {};
      lines.push([
        "recon",
        (r as any).created_at,
        (r as any).status,
        metrics.matchedCount ?? "",
        metrics.mismatchedCount ?? "",
        metrics.totalDelta ?? ""
      ].map(toCsvCell).join(","));
    }
    return lines.join("\n");
  }

  if (type === "fraud_detection") {
    const { data: patterns } = await params.supabase.rpc("analytics_fraud_patterns", { from_ts: fromIso, to_ts: toIso });
    const { data: alerts } = await params.supabase.rpc("dashboard_recent_alerts");

    const lines: string[] = [];
    lines.push("alerts_by_severity,severity,count");
    for (const r of (patterns?.alertsBySeverity ?? []) as any[]) {
      lines.push(["sev", r.severity, r.count].map(toCsvCell).join(","));
    }
    lines.push("");
    lines.push("top_dimensions,dimension_type,dimension_value,count");
    for (const r of (patterns?.topDimensions ?? []) as any[]) {
      lines.push(["dim", r.dimensionType, r.dimensionValue, r.count].map(toCsvCell).join(","));
    }
    lines.push("");
    lines.push("recent_alerts,id,title,severity,status,created_at");
    for (const a of (alerts ?? []) as any[]) {
      lines.push([a.id, a.title, a.severity, a.status, a.created_at].map(toCsvCell).join(","));
    }
    return lines.join("\n");
  }

  if (type === "roaming_activity") {
    const { data: roaming } = await params.supabase.rpc("analytics_roaming_activity", { from_ts: fromIso, to_ts: toIso });
    const lines: string[] = [];
    lines.push("international_daily,day,calls,revenue");
    for (const r of (roaming?.internationalDaily ?? []) as any[]) {
      lines.push(["daily", r.day, r.calls, r.revenue].map(toCsvCell).join(","));
    }
    lines.push("");
    lines.push("top_countries,country,calls,revenue,avg_duration_seconds");
    for (const r of (roaming?.topCountries ?? []) as any[]) {
      lines.push(["country", r.country, r.calls, r.revenue, r.avgDurationSeconds].map(toCsvCell).join(","));
    }
    return lines.join("\n");
  }

  if (type === "interconnect_revenue") {
    const { data: interconnect } = await params.supabase.rpc("analytics_interconnect_variance", {
      from_date: toDateOnly(fromIso),
      to_date: toDateOnly(toIso)
    });
    const lines: string[] = [];
    lines.push("partner_variance,partner_name,amount_due,amount_paid,variance");
    for (const r of (interconnect?.partnerVariance ?? []) as any[]) {
      lines.push(["partner", r.partnerName, r.amountDue, r.amountPaid, r.variance].map(toCsvCell).join(","));
    }
    lines.push("");
    lines.push("variance_by_period,period_start,variance");
    for (const r of (interconnect?.varianceByPeriod ?? []) as any[]) {
      lines.push(["period", r.periodStart, r.variance].map(toCsvCell).join(","));
    }
    return lines.join("\n");
  }

  if (type === "revenue_recovery") {
    const { data: events } = await params.supabase
      .from("revenue_recovery_events")
      .select("id,case_id,alert_id,amount,currency,recorded_at,notes")
      .eq("org_id", params.orgId)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .limit(10000);
    const total = (events ?? []).reduce((sum: number, e: any) => sum + toNumber(e.amount), 0);

    const lines: string[] = [];
    lines.push("summary,key,value");
    lines.push(["summary", "total_recovered", total].map(toCsvCell).join(","));
    lines.push(["summary", "events", (events ?? []).length].map(toCsvCell).join(","));
    lines.push("");
    lines.push("events,id,recorded_at,amount,currency,case_id,alert_id,notes");
    for (const e of events ?? []) {
      lines.push([
        (e as any).id,
        (e as any).recorded_at,
        (e as any).amount,
        (e as any).currency,
        (e as any).case_id,
        (e as any).alert_id,
        (e as any).notes
      ].map(toCsvCell).join(","));
    }
    return lines.join("\n");
  }

  if (type === "regulatory_summary") {
    const { data: alerts } = await params.supabase
      .from("alerts")
      .select("severity,status,created_at")
      .eq("org_id", params.orgId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(100000);
    const { data: cases } = await params.supabase
      .from("cases")
      .select("status,severity,created_at,closed_at")
      .eq("org_id", params.orgId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(100000);
    const { data: recon } = await params.supabase
      .from("reconciliations")
      .select("status,created_at,metrics")
      .eq("org_id", params.orgId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(100000);
    const { count: cdrCount } = await params.supabase
      .from("cdr_records")
      .select("id", { count: "exact", head: true })
      .eq("org_id", params.orgId)
      .gte("call_start_at", fromIso)
      .lte("call_start_at", toIso);

    const lines: string[] = [];
    lines.push("summary,key,value");
    lines.push(["summary", "cdr_count", cdrCount ?? 0].map(toCsvCell).join(","));
    lines.push(["summary", "alerts_count", (alerts ?? []).length].map(toCsvCell).join(","));
    lines.push(["summary", "cases_count", (cases ?? []).length].map(toCsvCell).join(","));
    lines.push(["summary", "reconciliation_runs", (recon ?? []).length].map(toCsvCell).join(","));
    lines.push("");
    lines.push("alerts,severity,status,count");
    const bySevStatus = new Map<string, number>();
    for (const a of alerts ?? []) {
      const key = `${(a as any).severity}|${(a as any).status}`;
      bySevStatus.set(key, (bySevStatus.get(key) ?? 0) + 1);
    }
    for (const [key, count] of bySevStatus.entries()) {
      const [sev, status] = key.split("|");
      lines.push([sev, status, count].map(toCsvCell).join(","));
    }
    return lines.join("\n");
  }

  const { data: audits } = await params.supabase
    .from("audit_log")
    .select("created_at,action,entity_type,entity_id,actor_user_id")
    .eq("org_id", params.orgId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(20000);

  const lines: string[] = [];
  lines.push("audit,created_at,action,entity_type,entity_id,actor_user_id");
  for (const row of audits ?? []) {
    lines.push([
      "audit",
      (row as any).created_at,
      (row as any).action,
      (row as any).entity_type,
      (row as any).entity_id,
      (row as any).actor_user_id
    ].map(toCsvCell).join(","));
  }
  return lines.join("\n");
}

export async function generateAndStoreReport(params: {
  supabase: any;
  orgId: string;
  actorUserId: string | null;
  type: ReportType;
  fromIso: string;
  toIso: string;
  name?: string | null;
  scheduleCron?: string | null;
  recipients?: string[];
}) {
  const fromDate = new Date(params.fromIso);
  const toDate = new Date(params.toIso);
  if (Number.isNaN(fromDate.getTime())) throw new Error("Invalid from date");
  if (Number.isNaN(toDate.getTime())) throw new Error("Invalid to date");

  const csv = await generateCsv({
    supabase: params.supabase,
    orgId: params.orgId,
    type: params.type,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString()
  });

  const reportName =
    (params.name ?? "").trim() ||
    `${params.type.replaceAll("_", " ")} — ${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`;

  const { data: inserted, error: insErr } = await params.supabase
    .from("reports")
    .insert({
      org_id: params.orgId,
      name: reportName,
      report_type: params.type,
      schedule_cron: params.scheduleCron ?? null,
      recipients: params.recipients ?? [],
      last_run_at: new Date().toISOString(),
      last_run_status: "running",
      last_run_error: null,
      config: { from: fromDate.toISOString(), to: toDate.toISOString(), type: params.type },
      metadata: { status: "generating" }
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  const reportId = String(inserted.id);
  const path = `org/${params.orgId}/reports/${reportId}.csv`;
  const supabaseAdmin = createSupabaseAdminClient();
  const { error: upErr } = await supabaseAdmin.storage.from("reports").upload(path, csv, {
    upsert: true,
    contentType: "text/csv;charset=utf-8"
  });
  if (upErr) {
    await params.supabase
      .from("reports")
      .update({
        last_run_status: "failed",
        last_run_error: upErr.message,
        metadata: { status: "failed", error: upErr.message }
      })
      .eq("id", reportId)
      .eq("org_id", params.orgId);
    throw upErr;
  }

  await params.supabase
    .from("reports")
    .update({
      last_run_status: "ready",
      last_run_error: null,
      last_output_path: path,
      metadata: { status: "ready", bucket: "reports", path, bytes: csv.length }
    })
    .eq("id", reportId)
    .eq("org_id", params.orgId);

  if (params.actorUserId) {
    await params.supabase.from("audit_log").insert({
      org_id: params.orgId,
      actor_user_id: params.actorUserId,
      action: "report.generated",
      entity_type: "report",
      entity_id: reportId,
      metadata: {
        type: params.type,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        bytes: csv.length,
        path
      }
    });
  }

  return { id: reportId, path };
}
