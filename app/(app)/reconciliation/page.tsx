"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { Play } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type ReconciliationRow = {
  id: string;
  name: string;
  status: string;
  source_a: string;
  source_b: string;
  created_at: string;
  metrics: any;
};

type MismatchRow = {
  id: string;
  status: string;
  match_key: string;
  source_a_value: number;
  source_b_value: number;
  delta: number;
};

const columns: Array<DataTableColumnDef<ReconciliationRow>> = [
  { accessorKey: "name", header: "Run", cell: ({ row }) => <div className="max-w-[420px] truncate font-medium">{row.original.name}</div> },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "source_a", header: "Source A" },
  { accessorKey: "source_b", header: "Source B" },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ getValue }) => {
      const v = String(getValue() ?? "");
      const d = v ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) return "—";
      return formatDistanceToNowStrict(d, { addSuffix: true });
    }
  }
];

const mismatchColumns: Array<DataTableColumnDef<MismatchRow>> = [
  { accessorKey: "match_key", header: "Key" },
  { accessorKey: "source_a_value", header: "Source A" },
  { accessorKey: "source_b_value", header: "Source B" },
  { accessorKey: "delta", header: "Delta" }
];

export default function ReconciliationPage() {
  const searchParams = useSearchParams();
  const reconciliationId = searchParams.get("id");
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<ReconciliationRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [sourceA, setSourceA] = React.useState("cdr_revenue");
  const [sourceB, setSourceB] = React.useState("settlements_due");
  const [tolerance, setTolerance] = React.useState("0");
  const [running, setRunning] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const [selected, setSelected] = React.useState<ReconciliationRow | null>(null);
  const [mismatches, setMismatches] = React.useState<MismatchRow[] | null>(null);

  const load = React.useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/reconciliation?limit=200");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load reconciliations.");
      setRows((body?.data ?? []) as ReconciliationRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load reconciliations.");
    }
  }, [activeOrg?.id]);

  const loadDetail = React.useCallback(async (id: string) => {
    setMismatches(null);
    const res = await fetch(`/api/reconciliation/${encodeURIComponent(id)}?limit=500`);
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(body?.error ?? "Failed to load detail.");
    setSelected((body?.data?.reconciliation ?? null) as ReconciliationRow | null);
    setMismatches((body?.data?.mismatches ?? []) as MismatchRow[]);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!reconciliationId) {
      setSelected(null);
      setMismatches(null);
      return;
    }
    void loadDetail(reconciliationId).catch((e) => setError(e?.message ?? "Failed to load detail."));
  }, [loadDetail, reconciliationId]);

  React.useEffect(() => {
    function onChanged() {
      void load();
    }
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onChanged as any);
    window.addEventListener(DATE_RANGE_CHANGED_EVENT, onChanged as any);
    return () => {
      window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onChanged as any);
      window.removeEventListener(DATE_RANGE_CHANGED_EVENT, onChanged as any);
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reconciliation"
        description="Compare two telecom data sources and surface mismatches."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Play className="h-4 w-4" />
                Run reconciliation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">Run reconciliation</div>
                <div className="mt-1 text-xs text-muted-foreground">Uses current date range from the top bar.</div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Source A</label>
                  <Input value={sourceA} onChange={(e) => setSourceA(e.target.value)} placeholder="cdr_revenue" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Source B</label>
                  <Input value={sourceB} onChange={(e) => setSourceB(e.target.value)} placeholder="settlements_due" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Tolerance</label>
                  <Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} type="number" min={0} step="0.01" />
                </div>
                <Button
                  disabled={running || !sourceA.trim() || !sourceB.trim()}
                  onClick={async () => {
                    setRunning(true);
                    try {
                      const res = await fetch("/api/reconciliation/run", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          sourceA: sourceA.trim(),
                          sourceB: sourceB.trim(),
                          periodStart: fromIso,
                          periodEnd: toIso,
                          options: { tolerance: Number(tolerance || 0) }
                        })
                      });
                      const body = (await res.json().catch(() => ({}))) as any;
                      if (!res.ok) throw new Error(body?.error ?? "Failed to run reconciliation.");
                      toast.success("Reconciliation completed");
                      setOpen(false);
                      await load();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to run reconciliation.");
                    } finally {
                      setRunning(false);
                    }
                  }}
                >
                  {running ? "Running…" : "Run now"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {error ? (
        <EmptyState title="Could not load reconciliations" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter runs…"
          empty={{ title: "No reconciliations yet", description: "Run a reconciliation to compare two data sources." }}
          getRowHref={(row) => `/reconciliation?id=${encodeURIComponent((row as any).id)}`}
        />
      )}

      {selected ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Run detail: {selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Status: {selected.status} • Matched: {selected.metrics?.matchedCount ?? 0} • Mismatched: {selected.metrics?.mismatchedCount ?? 0} • Delta:{" "}
              {selected.metrics?.totalDelta ?? 0}
            </div>
            {mismatches == null ? (
              <DataTableSkeleton rows={6} />
            ) : (
              <DataTable
                columns={mismatchColumns}
                data={mismatches}
                searchPlaceholder="Filter mismatches…"
                empty={{ title: "No mismatches", description: "All values matched within tolerance." }}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
