import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportedRuleType =
  | "volume_spike"
  | "international_call_spike"
  | "premium_number_calls"
  | "roaming_activity"
  | "duplicate_cdr_detection"
  | "high_cost_destination";

export type FraudRuleRow = {
  id: string;
  org_id: string;
  name: string;
  status: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  window_minutes: number;
  dimension_type: string;
  conditions: any;
};

export type FraudRuleVersionRow = { id: string; rule_id: string; version: number };

export type CdrRow = {
  id: string;
  org_id: string;
  call_start_at: string;
  duration_seconds: number | null;
  a_party: string | null;
  b_party: string | null;
  destination_country: string | null;
  account_id: string | null;
  carrier_id: string | null;
  revenue_amount: string | number | null;
  cost_amount: string | number | null;
  source_row_hash: string;
};

type EvaluationWindow = {
  windowStart: Date;
  windowEnd: Date;
};

export type EngineAlert = {
  org_id: string;
  rule_id: string;
  rule_version_id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  dedup_key: string;
  window_start_at: string;
  window_end_at: string;
  dimension_type: string;
  dimension_value: string;
  evidence: Record<string, any>;
};

export type EvaluationResult = {
  evaluatedRules: number;
  insertedAlerts: number;
  alerts: EngineAlert[];
  warnings: string[];
};

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function safeText(value: unknown) {
  const s = value == null ? "" : String(value).trim();
  return s || "—";
}

function ruleTypeFromConditions(conditions: any): SupportedRuleType | null {
  const t = conditions?.rule_type ?? conditions?.type ?? conditions?.kind ?? null;
  if (!t) return null;
  const str = String(t);
  switch (str) {
    case "volume_spike":
    case "international_call_spike":
    case "premium_number_calls":
    case "roaming_activity":
    case "duplicate_cdr_detection":
    case "high_cost_destination":
      return str;
    default:
      return null;
  }
}

export function getSupportedRuleType(conditions: any): SupportedRuleType | null {
  return ruleTypeFromConditions(conditions);
}

function thresholdFromRule(rule: FraudRuleRow) {
  const c = rule.conditions ?? {};
  if (c.threshold != null) return Math.max(0, toNumber(c.threshold));
  // backward-compatible: allow { thresholds: [{ metric: 'call_count', op: '>=', value: 123 }] }
  const first = Array.isArray(c.thresholds) ? c.thresholds[0] : null;
  if (first?.value != null) return Math.max(0, toNumber(first.value));
  return 0;
}

export function getRuleThreshold(rule: FraudRuleRow) {
  return thresholdFromRule(rule);
}

function normalizeWindowMinutes(value: unknown) {
  const n = Math.floor(toNumber(value));
  return n > 0 ? Math.min(n, 24 * 60) : 15;
}

function normalizeSeverity(value: unknown): EngineAlert["severity"] {
  const s = String(value ?? "medium");
  if (s === "low" || s === "medium" || s === "high" || s === "critical") return s;
  return "medium";
}

export function computeWindow(now: Date, windowMinutes: number): EvaluationWindow {
  const end = new Date(now);
  end.setSeconds(0, 0);
  const start = new Date(end.getTime() - windowMinutes * 60 * 1000);
  return { windowStart: start, windowEnd: end };
}

function inWindow(row: CdrRow, start: Date, end: Date) {
  const t = new Date(row.call_start_at);
  const ms = t.getTime();
  if (Number.isNaN(ms)) return false;
  return ms >= start.getTime() && ms <= end.getTime();
}

function makeDedupKey(ruleId: string, type: SupportedRuleType, dimensionType: string, dimensionValue: string) {
  return `${ruleId}:${type}:${dimensionType}:${dimensionValue}`;
}

function premiumPrefixesFromConditions(conditions: any): string[] {
  const raw = conditions?.premium_prefixes ?? conditions?.prefixes ?? null;
  const arr = Array.isArray(raw) ? raw : [];
  const cleaned = arr.map((x) => String(x).trim()).filter(Boolean);
  return cleaned.length ? cleaned : ["+1900", "+1976", "+4470"];
}

function homeCountryFromConditions(conditions: any): string {
  const hc = String(conditions?.home_country ?? conditions?.homeCountry ?? "US").trim().toUpperCase();
  return hc || "US";
}

function isInternational(row: CdrRow, homeCountry: string) {
  const dest = (row.destination_country ?? "").trim().toUpperCase();
  return dest && dest !== homeCountry;
}

function isPremiumNumber(row: CdrRow, prefixes: string[]) {
  const b = (row.b_party ?? "").trim();
  if (!b) return false;
  return prefixes.some((p) => b.startsWith(p));
}

function duplicateKey(row: CdrRow) {
  return [
    (row.a_party ?? "").trim(),
    (row.b_party ?? "").trim(),
    (row.destination_country ?? "").trim(),
    new Date(row.call_start_at).toISOString().slice(0, 16), // minute bucket
    String(row.duration_seconds ?? 0)
  ].join("|");
}

function evaluateRule(type: SupportedRuleType, rule: FraudRuleRow, versionId: string, window: EvaluationWindow, cdrRows: CdrRow[]) {
  const threshold = thresholdFromRule(rule);
  const severity = normalizeSeverity(rule.severity);
  const { windowStart, windowEnd } = window;

  const rows = cdrRows.filter((r) => inWindow(r, windowStart, windowEnd));

  const makeAlert = (dimensionType: string, dimensionValue: string, title: string, evidence: Record<string, any>): EngineAlert => ({
    org_id: rule.org_id,
    rule_id: rule.id,
    rule_version_id: versionId,
    severity,
    title,
    dedup_key: makeDedupKey(rule.id, type, dimensionType, dimensionValue),
    window_start_at: windowStart.toISOString(),
    window_end_at: windowEnd.toISOString(),
    dimension_type: dimensionType,
    dimension_value: dimensionValue,
    evidence
  });

  switch (type) {
    case "volume_spike": {
      const calls = rows.length;
      if (threshold > 0 && calls >= threshold) {
        return [
          makeAlert(
            "org",
            "all",
            `${rule.name}: call volume spike`,
            { type, calls, threshold, window_minutes: rule.window_minutes }
          )
        ];
      }
      return [];
    }

    case "international_call_spike": {
      const home = homeCountryFromConditions(rule.conditions);
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (!isInternational(r, home)) continue;
        const dest = (r.destination_country ?? "").trim().toUpperCase() || "—";
        counts.set(dest, (counts.get(dest) ?? 0) + 1);
      }
      const alerts: EngineAlert[] = [];
      for (const [dest, calls] of counts.entries()) {
        if (threshold > 0 && calls >= threshold) {
          alerts.push(
            makeAlert(
              "destination_country",
              dest,
              `${rule.name}: international spike — ${dest}`,
              { type, home_country: home, destination_country: dest, calls, threshold, window_minutes: rule.window_minutes }
            )
          );
        }
      }
      return alerts;
    }

    case "premium_number_calls": {
      const prefixes = premiumPrefixesFromConditions(rule.conditions);
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (!isPremiumNumber(r, prefixes)) continue;
        const prefix = prefixes.find((p) => (r.b_party ?? "").startsWith(p)) ?? "premium";
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
      const alerts: EngineAlert[] = [];
      for (const [prefix, calls] of counts.entries()) {
        if (threshold > 0 && calls >= threshold) {
          alerts.push(
            makeAlert(
              "premium_prefix",
              prefix,
              `${rule.name}: premium number calls — ${prefix}`,
              { type, prefix, calls, threshold, window_minutes: rule.window_minutes, premium_prefixes: prefixes }
            )
          );
        }
      }
      return alerts;
    }

    case "roaming_activity": {
      const home = homeCountryFromConditions(rule.conditions);
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (!isInternational(r, home)) continue;
        const dest = (r.destination_country ?? "").trim().toUpperCase() || "—";
        counts.set(dest, (counts.get(dest) ?? 0) + 1);
      }
      const alerts: EngineAlert[] = [];
      for (const [dest, calls] of counts.entries()) {
        if (threshold > 0 && calls >= threshold) {
          alerts.push(
            makeAlert(
              "roaming_destination",
              dest,
              `${rule.name}: roaming activity — ${dest}`,
              { type, home_country: home, destination_country: dest, calls, threshold, window_minutes: rule.window_minutes }
            )
          );
        }
      }
      return alerts;
    }

    case "duplicate_cdr_detection": {
      const seen = new Map<string, number>();
      for (const r of rows) {
        const key = duplicateKey(r);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const duplicates = Array.from(seen.entries()).filter(([, c]) => c > 1);
      const dupCount = duplicates.reduce((acc, [, c]) => acc + (c - 1), 0);
      if (threshold > 0 && dupCount >= threshold) {
        const top = duplicates
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([k, c]) => ({ key: k, count: c }));
        return [
          makeAlert("dedupe", "cdr", `${rule.name}: duplicate CDRs detected`, {
            type,
            duplicates: dupCount,
            threshold,
            window_minutes: rule.window_minutes,
            top_duplicates: top
          })
        ];
      }
      return [];
    }

    case "high_cost_destination": {
      const costs = new Map<string, number>();
      for (const r of rows) {
        const dest = (r.destination_country ?? "").trim().toUpperCase() || "—";
        const cost = toNumber(r.cost_amount);
        if (!cost) continue;
        costs.set(dest, (costs.get(dest) ?? 0) + cost);
      }
      const alerts: EngineAlert[] = [];
      for (const [dest, totalCost] of costs.entries()) {
        if (threshold > 0 && totalCost >= threshold) {
          alerts.push(
            makeAlert(
              "destination_country",
              dest,
              `${rule.name}: high cost destination — ${dest}`,
              { type, destination_country: dest, total_cost: totalCost, threshold, window_minutes: rule.window_minutes }
            )
          );
        }
      }
      return alerts;
    }

    default:
      return [];
  }
}

export function evaluateSingleRule(params: {
  type: SupportedRuleType;
  rule: FraudRuleRow;
  ruleVersionId: string;
  windowStart: Date;
  windowEnd: Date;
  cdrRows: CdrRow[];
}) {
  return evaluateRule(
    params.type,
    params.rule,
    params.ruleVersionId,
    { windowStart: params.windowStart, windowEnd: params.windowEnd },
    params.cdrRows
  );
}

export async function runRuleEvaluation(params: {
  supabase: SupabaseClient;
  orgId: string;
  ruleIds?: string[];
  now?: Date;
  dryRun?: boolean;
}): Promise<EvaluationResult> {
  const { supabase, orgId, ruleIds, now = new Date(), dryRun = false } = params;
  const warnings: string[] = [];

  // 1) Load enabled rules
  let ruleQuery = supabase
    .from("fraud_rules")
    .select("id,org_id,name,status,severity,window_minutes,dimension_type,conditions")
    .eq("org_id", orgId)
    .eq("status", "enabled");

  if (ruleIds?.length) ruleQuery = ruleQuery.in("id", ruleIds);

  const { data: rulesRaw, error: rErr } = await ruleQuery;
  if (rErr) throw rErr;

  const rules = (rulesRaw ?? []) as FraudRuleRow[];
  if (!rules.length) {
    return { evaluatedRules: 0, insertedAlerts: 0, alerts: [], warnings: ["No enabled rules found for org."] };
  }

  // 2) Load rule versions (latest per rule)
  const { data: versionsRaw, error: vErr } = await supabase
    .from("fraud_rule_versions")
    .select("id,rule_id,version")
    .eq("org_id", orgId)
    .in(
      "rule_id",
      rules.map((r) => r.id)
    );
  if (vErr) throw vErr;

  const versions = (versionsRaw ?? []) as FraudRuleVersionRow[];
  const latestVersionIdByRule = new Map<string, string>();
  const latestVersionNumByRule = new Map<string, number>();
  for (const v of versions) {
    const current = latestVersionNumByRule.get(v.rule_id) ?? -1;
    if (v.version > current) {
      latestVersionNumByRule.set(v.rule_id, v.version);
      latestVersionIdByRule.set(v.rule_id, v.id);
    }
  }

  // 3) Pull recent CDRs (use max window among rules)
  const windows = rules.map((r) => normalizeWindowMinutes(r.window_minutes));
  const maxWindow = Math.max(...windows, 15);
  const maxWin = computeWindow(now, maxWindow);

  const { data: cdrRaw, error: cErr } = await supabase
    .from("cdr_records")
    .select("id,org_id,call_start_at,duration_seconds,a_party,b_party,destination_country,account_id,carrier_id,revenue_amount,cost_amount,source_row_hash")
    .eq("org_id", orgId)
    .gte("call_start_at", maxWin.windowStart.toISOString())
    .lte("call_start_at", maxWin.windowEnd.toISOString())
    .limit(50000);
  if (cErr) throw cErr;

  const cdrRows = (cdrRaw ?? []) as CdrRow[];

  // 4) Evaluate each rule against CDRs
  const alerts: EngineAlert[] = [];

  for (const rule of rules) {
    const type = ruleTypeFromConditions(rule.conditions);
    if (!type) {
      warnings.push(`Rule "${rule.name}" (${rule.id}) has no supported rule_type in conditions; skipped.`);
      continue;
    }

    const versionId = latestVersionIdByRule.get(rule.id) ?? null;
    if (!versionId) {
      warnings.push(`Rule "${rule.name}" (${rule.id}) has no rule_version; skipped.`);
      continue;
    }

    const win = computeWindow(now, normalizeWindowMinutes(rule.window_minutes));
    const ruleAlerts = evaluateRule(type, rule, versionId, win, cdrRows);
    for (const a of ruleAlerts) alerts.push(a);
  }

  if (!alerts.length) {
    return { evaluatedRules: rules.length, insertedAlerts: 0, alerts: [], warnings };
  }

  if (dryRun) {
    return { evaluatedRules: rules.length, insertedAlerts: 0, alerts, warnings };
  }

  // 5) Insert alerts (dedupe by unique constraint org_id + dedup_key + window_start_at)
  const { data: inserted, error: iErr } = await supabase
    .from("alerts")
    .upsert(
      alerts.map((a) => ({
        org_id: a.org_id,
        rule_id: a.rule_id,
        rule_version_id: a.rule_version_id,
        severity: a.severity,
        title: a.title,
        dedup_key: a.dedup_key,
        window_start_at: a.window_start_at,
        window_end_at: a.window_end_at,
        dimension_type: a.dimension_type,
        dimension_value: a.dimension_value,
        evidence: a.evidence
      })),
      { onConflict: "org_id,dedup_key,window_start_at" }
    )
    .select("id");

  if (iErr) throw iErr;

  return {
    evaluatedRules: rules.length,
    insertedAlerts: (inserted ?? []).length,
    alerts,
    warnings
  };
}

export function validateRuleConfig(rule: FraudRuleRow) {
  const type = ruleTypeFromConditions(rule.conditions);
  const threshold = thresholdFromRule(rule);
  const windowMinutes = normalizeWindowMinutes(rule.window_minutes);
  return {
    type,
    threshold,
    windowMinutes,
    name: safeText(rule.name),
    severity: normalizeSeverity(rule.severity)
  };
}
