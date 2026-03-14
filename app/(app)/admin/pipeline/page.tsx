"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { RotateCcw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";

type Row = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  created_at: string;
  next_attempt_at: string | null;
  last_error: string | null;
  payload: any;
};

function timeAgo(iso: string) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export default function AdminPipelinePage() {
  const { activeOrg } = useActiveOrg();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/admin/pipeline-events?limit=200");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load pipeline events.");
      setRows((body?.data ?? []) as Row[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load pipeline events.");
    }
  }, [activeOrg?.id]);

  React.useEffect(() => void load(), [load]);

  React.useEffect(() => {
    function onOrgChanged() {
      void load();
    }
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
  }, [load]);

  const columns = React.useMemo<Array<DataTableColumnDef<Row>>>(() => {
    return [
      { accessorKey: "event_type", header: "Type", cell: ({ row }) => <div className="font-medium">{row.original.event_type}</div> },
      { accessorKey: "status", header: "Status" },
      { accessorKey: "attempt_count", header: "Attempts" },
      { accessorKey: "created_at", header: "Created", cell: ({ getValue }) => timeAgo(String(getValue() ?? "")) },
      { accessorKey: "next_attempt_at", header: "Next attempt", cell: ({ row }) => (row.original.next_attempt_at ? timeAgo(row.original.next_attempt_at) : "—") },
      {
        id: "summary",
        header: "Summary",
        cell: ({ row }) => {
          const p = row.original.payload ?? {};
          const importId = p.importId ? String(p.importId) : null;
          const range = p.fromIso && p.toIso ? `${String(p.fromIso).slice(0, 16)} → ${String(p.toIso).slice(0, 16)}` : null;
          const attempted = p.attemptedRows != null ? Number(p.attemptedRows) : null;
          return (
            <div className="min-w-0">
              <div className="truncate text-sm text-muted-foreground">{importId ? `importId: ${importId}` : "—"}</div>
              <div className="truncate text-xs text-muted-foreground">{range ? `range: ${range}` : attempted != null ? `rows: ${attempted}` : ""}</div>
              {row.original.last_error ? <div className="mt-1 truncate text-xs text-destructive">{row.original.last_error}</div> : null}
            </div>
          );
        }
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          const canRetry = r.status === "failed" || r.status === "dead_lettered";
          return (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                disabled={!canRetry}
                onClick={async (e) => {
                  e.stopPropagation();
                  const res = await fetch("/api/admin/pipeline-events/retry", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ eventId: r.id })
                  });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) toast.error(body?.error ?? "Retry failed");
                  else toast.success("Retry requested");
                  await load();
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          );
        }
      }
    ];
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title="Pipeline" description="Real-time processing queue (ingest → aggregates → rules → notifications)." />

      {error ? <EmptyState title="Could not load pipeline" description={error} /> : null}

      {rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter by type/status/error…"
          empty={{ title: "No pipeline events", description: "Ingest CDRs to enqueue real-time processing events." }}
        />
      )}
    </div>
  );
}

