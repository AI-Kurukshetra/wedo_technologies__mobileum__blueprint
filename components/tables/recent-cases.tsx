"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import type { DataTableColumnDef } from "@/components/tables/data-table";
import { DataTable } from "@/components/tables/data-table";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Row = { id: string; title: string; status: string; severity: AlertSeverity; owner: string; updatedAt: string };

const columns: Array<DataTableColumnDef<Row>> = [
  { accessorKey: "title", header: "Case", cell: ({ getValue }) => <div className="max-w-[360px] truncate font-medium">{String(getValue())}</div> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={String(getValue())} variant="outline" /> },
  { accessorKey: "severity", header: "Severity", cell: ({ row }) => <AlertSeverityBadge severity={row.original.severity} /> },
  { accessorKey: "owner", header: "Owner" },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ getValue }) => {
      const value = String(getValue() ?? "");
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return "—";
      return formatDistanceToNowStrict(date, { addSuffix: true });
    }
  }
];

export function RecentCasesTable() {
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
      const res = await fetch(`/api/dashboard/recent-cases?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load cases.");
      const rows = (body?.data ?? []) as Array<any>;

      const mapped: Row[] = ((rows ?? []) as Array<any>).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        severity: (r.severity as AlertSeverity) ?? "medium",
        owner: r.owner_user_id ? "Assigned" : "Unassigned",
        updatedAt: r.updated_at
      }));

      setData(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load cases.");
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
    return <EmptyState title="Could not load cases" description={error} />;
  }

  if (data == null) {
    return <DataTableSkeleton rows={6} />;
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Filter cases…"
      initialPageSize={5}
      empty={{ title: "No cases yet", description: "Create a case from an alert to start investigations." }}
    />
  );
}
