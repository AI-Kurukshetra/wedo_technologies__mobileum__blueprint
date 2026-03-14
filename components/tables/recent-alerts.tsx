"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import type { DataTableColumnDef } from "@/components/tables/data-table";
import { DataTable } from "@/components/tables/data-table";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { SeverityIndicator } from "@/components/SeverityIndicator";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Row = { id: string; createdAt: string; title: string; severity: AlertSeverity; status: string; assignee: string };

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
  { accessorKey: "title", header: "Alert", cell: ({ getValue }) => <div className="max-w-[360px] truncate font-medium">{String(getValue())}</div> },
  { accessorKey: "severity", header: "Severity", cell: ({ row }) => <AlertSeverityBadge severity={row.original.severity} /> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={String(getValue())} variant="outline" /> },
  { accessorKey: "assignee", header: "Assigned" }
];

export function RecentAlertsTable() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [data, setData] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      const res = await fetch(`/api/dashboard/recent-alerts?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load alerts.");
      const rows = (body?.data ?? []) as Array<any>;

      const mapped: Row[] = ((rows ?? []) as Array<any>).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        title: r.title,
        severity: (r.severity as AlertSeverity) ?? "medium",
        status: r.status,
        assignee: r.assigned_to_user_id ? "Assigned" : "Unassigned"
      }));

      setData(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load alerts.");
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

  if (error) {
    return <EmptyState title="Could not load alerts" description={error} />;
  }

  if (data == null) {
    return <DataTableSkeleton rows={6} />;
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Filter alerts…"
      initialPageSize={5}
      empty={{ title: "No alerts yet", description: "Enable rules and run evaluations to generate alerts." }}
    />
  );
}
