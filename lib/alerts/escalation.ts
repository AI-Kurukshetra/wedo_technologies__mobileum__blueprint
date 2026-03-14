import type { SupabaseClient } from "@supabase/supabase-js";

type Policy = { id: string; enabled: boolean; min_severity: string; email_recipients: string[]; webhook_urls: string[] };

function severityRank(sev: string) {
  switch (sev) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "critical":
      return 4;
    default:
      return 0;
  }
}

export async function escalateAlerts(params: { supabaseAdmin: SupabaseClient; orgId: string; limit?: number }) {
  const { supabaseAdmin, orgId, limit = 200 } = params;

  const { data: policies, error: pErr } = await supabaseAdmin
    .from("notification_policies")
    .select("id,enabled,min_severity,email_recipients,webhook_urls")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (pErr) throw pErr;

  const policy = (policies?.[0] ?? null) as Policy | null;
  if (!policy || !policy.enabled) return { escalated: 0, reason: "policy_disabled" };
  const webhookUrls = Array.isArray(policy.webhook_urls) ? policy.webhook_urls.map((x) => String(x).trim()).filter(Boolean) : [];
  const hasEmail = Array.isArray(policy.email_recipients) && policy.email_recipients.length > 0;
  if (!webhookUrls.length && !hasEmail) return { escalated: 0, reason: "no_channels" };

  const minRank = severityRank(String(policy.min_severity ?? "high"));

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: alerts, error: aErr } = await supabaseAdmin
    .from("alerts")
    .select("id,severity,status,created_at,notified_at,title,evidence,rule_id,dimension_type,dimension_value,window_start_at,window_end_at")
    .eq("org_id", orgId)
    .is("notified_at", null)
    .in("status", ["new", "acknowledged"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (aErr) throw aErr;

  const toEscalate = (alerts ?? []).filter((a: any) => severityRank(String(a.severity)) >= minRank);
  if (!toEscalate.length) return { escalated: 0, reason: "no_matches" };

  const nowIso = new Date().toISOString();
  const results: Array<{ alertId: string; delivered: number; failed: number }> = [];

  async function deliverWebhook(url: string, body: any) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "teleguard-pro/alerts-webhook" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`webhook_http_${res.status}`);
      return { ok: true as const };
    } finally {
      clearTimeout(timeout);
    }
  }

  for (const a of toEscalate as any[]) {
    const alertId = String(a.id);
    let delivered = 0;
    let failed = 0;

    if (webhookUrls.length) {
      for (const url of webhookUrls) {
        // Upsert delivery record to ensure idempotency; if already success, skip.
        const { data: existing } = await supabaseAdmin
          .from("notification_deliveries")
          .select("id,status,attempt_count")
          .eq("org_id", orgId)
          .eq("alert_id", alertId)
          .eq("channel", "webhook")
          .eq("target", url)
          .maybeSingle();

        const status = String((existing as any)?.status ?? "pending");
        if (status === "success") {
          delivered += 1;
          continue;
        }

        const attemptCount = Number((existing as any)?.attempt_count ?? 0);
        const { data: upserted, error: upErr } = await supabaseAdmin
          .from("notification_deliveries")
          .upsert(
            {
              org_id: orgId,
              alert_id: alertId,
              channel: "webhook",
              target: url,
              status: "pending",
              attempt_count: attemptCount,
              last_attempt_at: nowIso,
              last_error: null
            },
            { onConflict: "org_id,alert_id,channel,target" }
          )
          .select("id,attempt_count")
          .single();
        if (upErr) throw upErr;

        const payload = {
          type: "alert.escalated",
          orgId,
          alert: {
            id: alertId,
            title: a.title,
            severity: a.severity,
            status: a.status,
            createdAt: a.created_at,
            windowStartAt: a.window_start_at,
            windowEndAt: a.window_end_at,
            ruleId: a.rule_id,
            dimensionType: a.dimension_type,
            dimensionValue: a.dimension_value,
            evidence: a.evidence ?? {}
          }
        };

        try {
          await deliverWebhook(url, payload);
          const { error: okErr } = await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "success", last_error: null, last_attempt_at: nowIso, attempt_count: Number((upserted as any).attempt_count ?? 0) + 1 })
            .eq("id", (upserted as any).id)
            .eq("org_id", orgId);
          if (okErr) throw okErr;
          delivered += 1;
        } catch (e: any) {
          const msg = e?.message ?? "delivery_failed";
          await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "failed", last_error: msg, last_attempt_at: nowIso, attempt_count: Number((upserted as any).attempt_count ?? 0) + 1 })
            .eq("id", (upserted as any).id)
            .eq("org_id", orgId);
          failed += 1;
        }
      }
    }

    // Email channel is intentionally not implemented in code yet; do not block escalation if webhook succeeded.
    // If only email is configured, we mark the alert as notified to prevent infinite retries, and record an audit entry.
    const allWebhookOk = webhookUrls.length ? failed === 0 : true;
    const shouldMarkNotified = (webhookUrls.length && allWebhookOk) || (hasEmail && !webhookUrls.length);

    if (shouldMarkNotified) {
      const { error: upAlertErr } = await supabaseAdmin.from("alerts").update({ notified_at: nowIso }).eq("id", alertId).eq("org_id", orgId);
      if (upAlertErr) throw upAlertErr;
    }

    results.push({ alertId, delivered, failed });
  }

  // audit log (best effort)
  await supabaseAdmin.from("audit_log").insert(
    toEscalate.map((a: any) => ({
      org_id: orgId,
      actor_user_id: null,
      action: "alert.escalated",
      entity_type: "alert",
      entity_id: a.id,
      metadata: {
        policy_id: policy.id,
        min_severity: policy.min_severity,
        email_recipients: policy.email_recipients,
        webhook_urls: webhookUrls,
        title: a.title
      }
    }))
  );

  const escalated = results.filter((r) => r.delivered > 0 || r.failed > 0).length;
  return { escalated, notified_at: nowIso, policy_id: policy.id, results, warning: hasEmail && !webhookUrls.length ? "email_not_implemented" : null };
}
