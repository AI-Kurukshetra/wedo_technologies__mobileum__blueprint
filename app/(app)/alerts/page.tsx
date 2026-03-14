"use client";

import { toast } from "sonner";
import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { SeverityIndicator } from "@/components/SeverityIndicator";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Row = { id: string; createdAt: string; title: string; severity: AlertSeverity; status: string; assignedTo: string; window: string };

const columns: Array<DataTableColumnDef<Row>> = [
  {
    id: "sev",
    header: "",
    cell: ({ row }) => <SeverityIndicator severity={row.original.severity} className="opacity-90" />
  },
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
  { accessorKey: "title", header: "Alert", cell: ({ getValue }) => <div className="max-w-[420px] truncate font-medium">{String(getValue())}</div> },
  { accessorKey: "severity", header: "Severity", cell: ({ row }) => <AlertSeverityBadge severity={row.original.severity} /> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={String(getValue())} variant="outline" /> },
  { accessorKey: "window", header: "Window" },
  { accessorKey: "assignedTo", header: "Assigned" }
];

function timeRangeLabel(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return "—";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(start)}–${fmt(end)}`;
}

export default function AlertsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      sp.set("limit", "200");
      const res = await fetch(`/api/alerts?${sp.toString()}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load alerts.");
      const data = (payload?.data ?? []) as any[];

      const mapped: Row[] = (data ?? []).map((a: any) => ({
        id: a.id,
        createdAt: a.created_at,
        title: a.title,
        severity: (a.severity as AlertSeverity) ?? "medium",
        status: a.status,
        window: timeRangeLabel(a.window_start_at, a.window_end_at),
        assignedTo: a.assigned_to_user_id ? "Assigned" : "Unassigned"
      }));

      setRows(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load alerts.");
    }
  }, [activeOrg?.id, fromIso, toIso]);

  React.useEffect(() => {
    void load().catch(() => {});
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
        title="Alerts"
        description="Triage suspicious activity with explainable evidence."
        right={
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch("/api/alerts/run-evaluation", { method: "POST" });
              const payload = await res.json().catch(() => ({}));
              if (!res.ok) {
                toast.error(payload?.error ?? "Failed to run evaluation");
                return;
              }
              toast.success("Evaluation complete");
              await load();
            }}
          >
            Run evaluation
          </Button>
        }
      />

      {error ? (
        <EmptyState title="Could not load alerts" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter alerts…"
          getRowHref={(r) => `/alerts/${encodeURIComponent((r as any).id)}`}
          empty={{ title: "No alerts yet", description: "Enable rules and run evaluations to generate alerts." }}
        />
      )}
    </div>
  );
}
