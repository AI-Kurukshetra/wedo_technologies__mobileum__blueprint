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

  // 1) Orgs
  const orgA = await upsertOrg(supabase, { name: "Acme Telco", slug: "acme" });
  const orgB = await upsertOrg(supabase, { name: "Beta MVNO", slug: "beta" });

  // 2) Users (Auth)
  const users = [
    { email: "admin@acme.example", role: "admin", org: orgA, org_name: orgA.name },
    { email: "manager@acme.example", role: "manager", org: orgA, org_name: orgA.name },
    { email: "analyst@acme.example", role: "analyst", org: orgA, org_name: orgA.name },
    { email: "admin@beta.example", role: "admin", org: orgB, org_name: orgB.name },
    { email: "readonly@beta.example", role: "read_only", org: orgB, org_name: orgB.name }
  ];

  const createdUsers = [];
  for (const u of users) {
    const user = await getOrCreateUser(supabase, {
      email: u.email,
      password: seedPassword,
      metadata: { org_name: u.org_name }
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
        { org_id: orgA.id, enabled: true, min_severity: "high", email_recipients: ["fraud@acme.example"] },
        { org_id: orgB.id, enabled: true, min_severity: "critical", email_recipients: ["noc@beta.example"] }
      ],
      { onConflict: "org_id" }
    );

  // 5) Imports (so CDRs can reference imports)
  const { data: importsA, error: importsAErr } = await supabase
    .from("cdr_imports")
    .insert([
      { org_id: orgA.id, status: "processed", source: "seed", original_filename: "seed_acme_1.csv", storage_object_path: "seed/acme/1.csv" },
      { org_id: orgA.id, status: "processed", source: "seed", original_filename: "seed_acme_2.csv", storage_object_path: "seed/acme/2.csv" }
    ])
    .select("id,org_id");
  if (importsAErr) throw importsAErr;

  const { data: importsB, error: importsBErr } = await supabase
    .from("cdr_imports")
    .insert([
      { org_id: orgB.id, status: "processed", source: "seed", original_filename: "seed_beta_1.csv", storage_object_path: "seed/beta/1.csv" }
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
      snapshot: { ...r, version: 1, created_at: iso(Date.now()), seed_index: idx }
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
  const carriers = ["TRK-1", "TRK-2", "TRK-9"];
  const accountsA = ["ACME-001", "ACME-002", "ACME-003"];
  const accountsB = ["BETA-001", "BETA-002"];
  const statuses = ["answered", "failed", "no_answer"];

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  function genCdr({ org, importId, accountList }) {
    const start = now - Math.floor(rng() * sevenDays);
    const duration = Math.max(1, Math.floor(rng() * 220));
    const end = start + duration * 1000;
    const dest = pick(rng, destinationCountries);
    const accountId = pick(rng, accountList);
    const carrierId = pick(rng, carriers);
    const answerStatus = pick(rng, statuses);
    const revenue = Number((rng() * 0.8).toFixed(6));
    const cost = Number((revenue * (0.6 + rng() * 0.25)).toFixed(6));
    const aParty = `+1${Math.floor(2000000000 + rng() * 7999999999)}`;
    const bParty = `+${dest === "US" ? "1" : dest === "GB" ? "44" : "234"}${Math.floor(2000000000 + rng() * 7999999999)}`;
    const destinationPrefix = dest === "US" ? "+1" : dest === "GB" ? "+44" : "+234";

    const hashSource = `${org.id}|${importId}|${start}|${duration}|${aParty}|${bParty}|${dest}|${accountId}|${carrierId}|${answerStatus}|${revenue}|${cost}`;

    return {
      org_id: org.id,
      import_id: importId,
      source_row_number: null,
      source_row_hash: sha256(hashSource),
      call_start_at: iso(start),
      call_end_at: iso(end),
      duration_seconds: duration,
      direction: "outbound",
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
      raw: { seed: true }
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
          totalRevenue: Number((rng() * 9000).toFixed(6))
        },
        seed: true
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

  const cases = [];
  for (let i = 0; i < 20; i++) {
    cases.push({
      org_id: orgA.id,
      title: `Investigation — ${pick(rng, accountsA)}`,
      status: pick(rng, ["open", "in_review", "closed"]),
      severity: pick(rng, ["medium", "high", "critical"]),
      owner_user_id: createdUsers.find((u) => u.email === "analyst@acme.example").user.id,
      outcome: null,
      description: "Seeded case for demo workflows."
    });
  }
  for (let i = 0; i < 10; i++) {
    cases.push({
      org_id: orgB.id,
      title: `Investigation — ${pick(rng, accountsB)}`,
      status: pick(rng, ["open", "in_review", "closed"]),
      severity: pick(rng, ["low", "medium", "high"]),
      owner_user_id: createdUsers.find((u) => u.email === "admin@beta.example").user.id,
      outcome: null,
      description: "Seeded case for demo workflows."
    });
  }

  const { data: insertedCases, error: casesErr } = await supabase.from("cases").insert(cases).select("id,org_id");
  if (casesErr) throw casesErr;

  const caseAlerts = [];
  const caseEvents = [];
  for (const c of insertedCases) {
    const pool = insertedAlertsByOrg[c.org_id] ?? [];
    const linkCount = Math.max(1, Math.floor(rng() * 4));
    for (let i = 0; i < linkCount; i++) {
      const alertId = pick(rng, pool);
      caseAlerts.push({ org_id: c.org_id, case_id: c.id, alert_id: alertId });
    }
    caseEvents.push({
      org_id: c.org_id,
      case_id: c.id,
      actor_user_id: null,
      event_type: "note",
      message: "Seeded timeline event.",
      metadata: { seed: true }
    });
  }

  await insertInBatches(supabase, "case_alerts", caseAlerts, 1000);
  await insertInBatches(supabase, "case_events", caseEvents, 1000);

  console.log("Seed complete.");
  console.log("Orgs:", orgA.slug, orgB.slug);
  console.log("Users created/ensured:", createdUsers.map((u) => u.email).join(", "));
  console.log("Seed password:", seedPassword);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
