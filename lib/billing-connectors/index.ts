export type BillingConnectorType = "mock_rest" | "mock_csv";

export type BillingRecord = {
  reference: string;
  amount: number;
  currency?: string;
  period?: string;
  metadata?: Record<string, any>;
};

export type BillingConnectorDefinition = {
  type: BillingConnectorType;
  title: string;
  description: string;
  defaults: Record<string, any>;
};

const definitions: BillingConnectorDefinition[] = [
  {
    type: "mock_rest",
    title: "Mock REST connector",
    description: "Generates synthetic billing records for a date range.",
    defaults: { seed: "demo", baseAmount: 1000, variancePct: 0.15 }
  },
  {
    type: "mock_csv",
    title: "Mock CSV connector",
    description: "Uses inline CSV config text and parses billing records.",
    defaults: { csv: "reference,amount,currency,period\nACME-001,1200,USD,2026-03-01\nACME-002,980,USD,2026-03-01" }
  }
];

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function listConnectorDefinitions() {
  return definitions;
}

function hashCode(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function generateMockRestRecords(config: Record<string, any>, fromIso: string, toIso: string): BillingRecord[] {
  const seed = String(config.seed ?? "demo");
  const baseAmount = Math.max(0, toNumber(config.baseAmount ?? 1000));
  const variancePct = Math.min(1, Math.max(0, toNumber(config.variancePct ?? 0.15)));
  const start = new Date(fromIso);
  const end = new Date(toIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const records: BillingRecord[] = [];
  const stepMs = 24 * 60 * 60 * 1000;
  for (let ts = start.getTime(); ts <= end.getTime(); ts += stepMs) {
    const d = new Date(ts);
    const day = d.toISOString().slice(0, 10);
    const noise = ((hashCode(`${seed}:${day}`) % 1000) / 1000 - 0.5) * 2;
    const amount = Math.max(0, baseAmount * (1 + noise * variancePct));
    records.push({
      reference: `MOCK-${day}`,
      amount: Number(amount.toFixed(6)),
      currency: String(config.currency ?? "USD"),
      period: day,
      metadata: { source: "mock_rest", seed }
    });
  }
  return records;
}

function parseCsvLine(line: string) {
  // Simple parser for controlled demo CSV; does not support quoted commas.
  return line.split(",").map((s) => s.trim());
}

function parseMockCsvRecords(config: Record<string, any>) {
  const text = String(config.csv ?? "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1);
  const records: BillingRecord[] = [];
  for (const row of rows) {
    const values = parseCsvLine(row);
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = values[i] ?? "";
    records.push({
      reference: obj.reference || obj.id || `ROW-${records.length + 1}`,
      amount: toNumber(obj.amount),
      currency: obj.currency || "USD",
      period: obj.period || undefined,
      metadata: { source: "mock_csv" }
    });
  }
  return records;
}

export async function fetchConnectorRecords(params: {
  connectorType: BillingConnectorType;
  config: Record<string, any>;
  fromIso: string;
  toIso: string;
}) {
  if (params.connectorType === "mock_rest") {
    return generateMockRestRecords(params.config, params.fromIso, params.toIso);
  }
  if (params.connectorType === "mock_csv") {
    return parseMockCsvRecords(params.config);
  }
  throw new Error(`Unsupported connector type: ${params.connectorType}`);
}

export async function testConnector(params: {
  connectorType: BillingConnectorType;
  config: Record<string, any>;
  fromIso: string;
  toIso: string;
}) {
  const records = await fetchConnectorRecords(params);
  return {
    ok: true,
    count: records.length,
    sample: records.slice(0, 10)
  };
}
