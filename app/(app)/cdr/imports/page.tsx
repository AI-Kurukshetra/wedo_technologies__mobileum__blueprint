"use client";

import { toast } from "sonner";
import { Upload } from "lucide-react";
import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import Papa from "papaparse";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Row = { id: string; createdAt: string; filename: string; status: string; ok: number; failed: number; total: number };

const columns: Array<DataTableColumnDef<Row>> = [
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ getValue }) => {
      const value = String(getValue() ?? "");
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return "—";
      return formatDistanceToNowStrict(date, { addSuffix: true });
    }
  },
  { accessorKey: "filename", header: "File", cell: ({ getValue }) => <div className="max-w-[320px] truncate font-medium">{String(getValue())}</div> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={String(getValue())} variant="outline" /> },
  { accessorKey: "total", header: "Total" },
  { accessorKey: "ok", header: "OK" },
  { accessorKey: "failed", header: "Failed" }
];

type ParsedCdr = {
  callStartAt: string;
  durationSeconds: number;
  aParty: string | null;
  bParty: string | null;
  destinationCountry: string | null;
  accountId: string | null;
  carrierId: string | null;
  revenueAmount: number | null;
  costAmount: number | null;
  raw: Record<string, any>;
};

function pickFirst(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const v = row[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function parseNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseCdrRow(row: Record<string, any>): ParsedCdr | null {
  const callStartAt =
    pickFirst(row, ["call_start_at", "started_at", "start_time", "start", "call_start", "startedAt"]) ??
    null;
  if (!callStartAt) return null;
  const parsedStart = new Date(callStartAt);
  if (Number.isNaN(parsedStart.getTime())) return null;

  const durationRaw = pickFirst(row, ["duration_seconds", "duration", "duration_sec", "sec", "seconds"]);
  const durationSeconds = Math.max(0, Math.round(parseNumber(durationRaw) ?? 0));

  const aParty = pickFirst(row, ["a_party", "caller_number", "caller", "from", "aParty"]);
  const bParty = pickFirst(row, ["b_party", "callee_number", "callee", "to", "bParty"]);
  const destinationCountry = pickFirst(row, ["destination_country", "dest_country", "country", "destinationCountry"]);
  const accountId = pickFirst(row, ["account_id", "account", "customer", "accountId"]);
  const carrierId = pickFirst(row, ["carrier_id", "carrier", "carrierId"]);

  const revenueAmount = parseNumber(pickFirst(row, ["revenue_amount", "revenue", "price", "charge"]));
  const costAmount = parseNumber(pickFirst(row, ["cost_amount", "cost", "buy_cost"]));

  return {
    callStartAt,
    durationSeconds,
    aParty,
    bParty,
    destinationCountry,
    accountId,
    carrierId,
    revenueAmount,
    costAmount,
    raw: row
  };
}

export default function CdrImportsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      sp.set("limit", "200");
      const res = await fetch(`/api/cdr/imports?${sp.toString()}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load imports.");
      const data = (payload?.data ?? []) as any[];

      const mapped: Row[] = (data ?? []).map((i: any) => ({
        id: i.id,
        createdAt: i.created_at,
        filename: i.original_filename ?? "—",
        status: i.status,
        total: i.row_count_total ?? 0,
        ok: i.row_count_ok ?? 0,
        failed: i.row_count_failed ?? 0
      }));

      setRows(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load imports.");
    }
  }, [activeOrg?.id, fromIso, toIso]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    function onOrgChanged() {
      void load();
    }
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
    window.addEventListener(DATE_RANGE_CHANGED_EVENT, onOrgChanged as any);
    return () => {
      window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
      window.removeEventListener(DATE_RANGE_CHANGED_EVENT, onOrgChanged as any);
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="CDR Imports"
        description="Upload and track CDR ingestion jobs."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!activeOrg?.id}>
                <Upload className="h-4 w-4" />
                Upload CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">Upload CDR CSV</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Imports CDR rows into the active organization and updates analytics automatically.
                </div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="cdr_csv">
                    CSV file
                  </label>
                  <Input
                    id="cdr_csv"
                    type="file"
                    accept=".csv,text/csv"
                    disabled={isUploading}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="text-xs text-muted-foreground">
                    Required column: <span className="font-medium">call_start_at</span>. Optional: <span className="font-medium">duration_seconds</span>,{" "}
                    <span className="font-medium">a_party</span>, <span className="font-medium">b_party</span>,{" "}
                    <span className="font-medium">destination_country</span>, <span className="font-medium">revenue_amount</span>,{" "}
                    <span className="font-medium">cost_amount</span>.
                  </div>
                </div>

                <Button
                  disabled={isUploading || !activeOrg?.id || !file}
                  onClick={async () => {
                    if (!activeOrg?.id || !file) return;
                    setIsUploading(true);
                    try {
                      const parsed = await new Promise<Papa.ParseResult<Record<string, any>>>((resolve, reject) => {
                        Papa.parse<Record<string, any>>(file, {
                          header: true,
                          skipEmptyLines: true,
                          transformHeader: (h) => h.trim(),
                          complete: resolve,
                          error: reject
                        });
                      });

                      const total = parsed.data.length;
                      if (!total) {
                        toast.error("No rows found in CSV");
                        return;
                      }

                      const mapped = parsed.data.map(parseCdrRow);
                      const okRows = mapped.filter(Boolean) as ParsedCdr[];
                      const failed = total - okRows.length;
                      if (!okRows.length) {
                        toast.error("No valid rows to import", { description: "Ensure the CSV has a call_start_at column." });
                        return;
                      }

                      const startRes = await fetch("/api/cdr/imports/start", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          originalFilename: file.name,
                          total,
                          failed,
                          storageObjectPath: `uploads/${activeOrg.id}/${crypto.randomUUID()}/${file.name}`
                        })
                      });
                      const startPayload = await startRes.json().catch(() => ({}));
                      if (!startRes.ok) throw new Error(startPayload?.error ?? "Failed to start import.");
                      const importId = String(startPayload?.importId ?? "");
                      if (!importId) throw new Error("Failed to start import.");

                      let inserted = 0;

                      const batchSize = 500;
                      for (let offset = 0; offset < okRows.length; offset += batchSize) {
                        const slice = okRows.slice(offset, offset + batchSize);
                        const payload = slice.map((r, idx) => ({
                          sourceRowNumber: offset + idx + 1,
                          sourceRowHash: crypto.randomUUID(),
                          callStartAt: r.callStartAt,
                          durationSeconds: r.durationSeconds,
                          aParty: r.aParty,
                          bParty: r.bParty,
                          destinationCountry: r.destinationCountry,
                          accountId: r.accountId,
                          carrierId: r.carrierId,
                          revenueAmount: r.revenueAmount,
                          costAmount: r.costAmount,
                          raw: r.raw
                        }));

                        const appendRes = await fetch("/api/cdr/imports/append", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ importId, rows: payload })
                        });
                        const appendPayload = await appendRes.json().catch(() => ({}));
                        if (!appendRes.ok) throw new Error(appendPayload?.error ?? "Failed to append rows.");
                        inserted += Number(appendPayload?.inserted ?? payload.length);
                      }

                      const finishRes = await fetch("/api/cdr/imports/finish", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ importId, ok: inserted, failed: total - inserted })
                      });
                      const finishPayload = await finishRes.json().catch(() => ({}));
                      if (!finishRes.ok) throw new Error(finishPayload?.error ?? "Failed to finish import.");

                      toast.success("Import completed", { description: `Imported ${inserted.toLocaleString()} rows.` });
                      setOpen(false);
                      setFile(null);
                      await load();
                    } catch (e: any) {
                      toast.error("Import failed", { description: e?.message ?? "Unable to import CSV." });
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                >
                  {isUploading ? "Importing…" : "Import CSV"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {error ? (
        <EmptyState title="Could not load imports" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter imports…"
          getRowHref={(r) => `/cdr/imports/${encodeURIComponent((r as any).id)}`}
          empty={{
            title: "No imports yet",
            description: "Upload a CDR CSV to start analytics and detection.",
            cta: { label: "Upload CDR CSV", onClick: () => setOpen(true) }
          }}
        />
      )}
    </div>
  );
}
