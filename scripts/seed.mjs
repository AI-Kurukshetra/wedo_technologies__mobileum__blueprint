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
});
