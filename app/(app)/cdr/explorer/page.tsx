"use client";

import { toast } from "sonner";
import { Download } from "lucide-react";
import * as React from "react";
import { format } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Row = {
  callStartAt: string;
  durationSeconds: number;
  aParty: string;
  bParty: string;
  destinationCountry: string;
  accountId: string;
  revenue: string;
};

const columns: Array<DataTableColumnDef<Row>> = [
  { accessorKey: "callStartAt", header: "Start" },
  { accessorKey: "accountId", header: "Account", cell: ({ getValue }) => <div className="font-medium">{String(getValue())}</div> },
  { accessorKey: "aParty", header: "A-party" },
  { accessorKey: "bParty", header: "B-party" },
  { accessorKey: "destinationCountry", header: "Dest" },
  { accessorKey: "durationSeconds", header: "Sec" },
  { accessorKey: "revenue", header: "Revenue" }
];

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export default function CdrExplorerPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const deferredFilter = React.useDeferredValue(filter);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      sp.set("limit", "500");
      if (deferredFilter.trim()) sp.set("q", deferredFilter.trim());

      const res = await fetch(`/api/cdr/explorer?${sp.toString()}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load CDRs.");
      const data = (payload?.data ?? []) as any[];

      const mapped: Row[] = (data ?? []).map((r: any) => ({
        callStartAt: r.call_start_at ? format(new Date(r.call_start_at), "yyyy-MM-dd HH:mm") : "—",
        durationSeconds: r.duration_seconds ?? 0,
        aParty: r.a_party ?? "—",
        bParty: r.b_party ?? "—",
        destinationCountry: r.destination_country ?? "—",
        accountId: r.account_id ?? "—",
        revenue: formatUsd(safeNumber(r.revenue_amount))
      }));

      setRows(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load CDRs.");
    }
  }, [activeOrg?.id, deferredFilter, fromIso, toIso]);

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

  function toCsvCell(value: unknown) {
    const s = value == null ? "" : String(value);
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="CDR Explorer"
        description="Filter and drill into call detail records."
        right={
          <Button
            variant="outline"
            className="gap-2"
            disabled={!activeOrg?.id}
            onClick={async () => {
              try {
                const sp = new URLSearchParams();
                sp.set("from", fromIso);
                sp.set("to", toIso);
                sp.set("limit", "5000");
                if (deferredFilter.trim()) sp.set("q", deferredFilter.trim());

                const res = await fetch(`/api/cdr/explorer?${sp.toString()}`);
                const payload = (await res.json().catch(() => ({}))) as any;
                if (!res.ok) throw new Error(payload?.error ?? "Export failed");
                const data = (payload?.data ?? []) as any[];

                const rows = (data ?? []) as any[];
                if (!rows.length) {
                  toast.message("No rows to export", { description: "Try widening the date range or adjusting filters." });
                  return;
                }

                const headers = [
                  "call_start_at",
                  "duration_seconds",
                  "a_party",
                  "b_party",
                  "destination_country",
                  "account_id",
                  "carrier_id",
                  "revenue_amount",
                  "cost_amount"
                ];

                const lines = [
                  headers.join(","),
                  ...rows.map((r) =>
                    [
                      r.call_start_at,
                      r.duration_seconds,
                      r.a_party,
                      r.b_party,
                      r.destination_country,
                      r.account_id,
                      r.carrier_id,
                      r.revenue_amount,
                      r.cost_amount
                    ]
                      .map(toCsvCell)
                      .join(",")
                  )
                ];

                const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `teleguard-cdr-export-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                toast.success("CSV exported", { description: `${rows.length.toLocaleString()} rows downloaded.` });
              } catch (e: any) {
                toast.error("Export failed", { description: e?.message ?? "Unable to export CSV." });
              }
            }}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <FilterBar placeholder="Filter by account, destination, carrier…" value={filter} onChange={setFilter} />

      {error ? (
        <EmptyState title="Could not load CDRs" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={12} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Search CDRs…"
          empty={{
            title: "No CDRs match your filters",
            description: "Try widening the date range or removing filters."
          }}
        />
      )}
    </div>
  );
}
