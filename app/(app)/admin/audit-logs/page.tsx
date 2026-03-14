"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Row = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
};

const columns: Array<DataTableColumnDef<Row>> = [
  {
    accessorKey: "created_at",
    header: "When",
    cell: ({ getValue }) => {
      const value = String(getValue() ?? "");
      const d = value ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return "—";
      return formatDistanceToNowStrict(d, { addSuffix: true });
    }
  },
  { accessorKey: "action", header: "Action", cell: ({ getValue }) => <div className="font-medium">{String(getValue() ?? "—")}</div> },
  { accessorKey: "entity_type", header: "Entity" },
  { accessorKey: "entity_id", header: "Entity ID", cell: ({ getValue }) => <div className="max-w-[220px] truncate">{String(getValue() ?? "—")}</div> },
  { accessorKey: "actor_user_id", header: "Actor", cell: ({ getValue }) => <div className="max-w-[220px] truncate">{String(getValue() ?? "—")}</div> }
];

export default function AuditLogsPage() {
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
      const sp = new URLSearchParams({ from: fromIso, to: toIso, limit: "250" });
      if (deferredFilter.trim()) sp.set("action", deferredFilter.trim());
      const res = await fetch(`/api/admin/audit-logs?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load audit logs.");
      setRows((body?.data ?? []) as Row[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load audit logs.");
    }
  }, [activeOrg?.id, deferredFilter, fromIso, toIso]);

  React.useEffect(() => void load(), [load]);

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
      <PageHeader title="Audit logs" description="Security and workflow audit trail for the active organization." />
      <FilterBar placeholder="Filter actions (e.g. alert.resolved)..." value={filter} onChange={setFilter} />

      {error ? (
        <EmptyState title="Could not load audit logs" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={12} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter logs…"
          empty={{ title: "No logs", description: "Once users act on alerts, rules, and cases, logs appear here." }}
        />
      )}
    </div>
  );
}

