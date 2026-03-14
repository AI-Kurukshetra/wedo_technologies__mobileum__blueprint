"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type RunRow = {
  id: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  checks_total: number;
  checks_failed: number;
  created_at: string;
};

const columns: Array<DataTableColumnDef<RunRow>> = [
  {
    accessorKey: "created_at",
    header: "Run time",
    cell: ({ getValue }) => {
      const v = String(getValue() ?? "");
      const d = v ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) return "—";
      return formatDistanceToNowStrict(d, { addSuffix: true });
    }
  },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "checks_total", header: "Checks" },
  { accessorKey: "checks_failed", header: "Failed" }
];

export default function DataQualityPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<RunRow[] | null>(null);
  const [detail, setDetail] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  const load = React.useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/data-quality?limit=200");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load runs.");
      setRows((body?.data ?? []) as RunRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load runs.");
    }
  }, [activeOrg?.id]);

  const loadDetail = React.useCallback(async () => {
    if (!runId) return setDetail(null);
    const res = await fetch(`/api/data-quality/${encodeURIComponent(runId)}`);
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(body?.error ?? "Failed to load run detail.");
    setDetail(body?.data ?? null);
  }, [runId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    void loadDetail().catch((e) => setError(e?.message ?? "Failed to load run detail."));
  }, [loadDetail]);

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
        title="Data quality"
        description="Run CDR validation and consistency checks."
        right={
          <Button
            disabled={running}
            onClick={async () => {
              setRunning(true);
              try {
                const res = await fetch("/api/data-quality/run", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ periodStart: fromIso, periodEnd: toIso })
                });
                const body = (await res.json().catch(() => ({}))) as any;
                if (!res.ok) throw new Error(body?.error ?? "Failed to run checks.");
                toast.success("Data quality run completed");
                await load();
              } catch (e: any) {
                toast.error(e?.message ?? "Failed to run checks.");
              } finally {
                setRunning(false);
              }
            }}
          >
            {running ? "Running…" : "Run checks"}
          </Button>
        }
      />

      {error ? (
        <EmptyState title="Could not load data quality runs" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={8} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter runs…"
          getRowHref={(row) => `/data-quality?runId=${encodeURIComponent((row as any).id)}`}
          empty={{ title: "No runs yet", description: "Run checks to store data quality results." }}
        />
      )}

      {detail ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Run detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Status: {detail.status} • Failed checks: {detail.checks_failed}/{detail.checks_total}
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              {JSON.stringify(detail.details ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
