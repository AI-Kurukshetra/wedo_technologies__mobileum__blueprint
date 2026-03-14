"use client";

import * as React from "react";
import type { DataTableColumnDef } from "@/components/tables/data-table";
import { DataTable } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Row = { country: string; callCount: number; revenue: string };

const columns: Array<DataTableColumnDef<Row>> = [
  { accessorKey: "country", header: "Destination", cell: ({ getValue }) => <div className="font-medium">{String(getValue())}</div> },
  { accessorKey: "callCount", header: "Calls" },
  { accessorKey: "revenue", header: "Revenue" }
];

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function TopDestinationsTable() {
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
      const res = await fetch(`/api/dashboard/top-destinations?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load destinations.");
      const rows = (body?.data ?? []) as Array<{ destination_country: string | null; calls: number; revenue: unknown }>;

      const top = ((rows ?? []) as Array<{ destination_country: string | null; calls: number; revenue: unknown }>).map((r) => ({
        country: r.destination_country ?? "—",
        callCount: Number(r.calls ?? 0),
        revenue: formatUsd(safeNumber(r.revenue))
      }));

      setData(top);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load destinations.");
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
    return <EmptyState title="Could not load destinations" description={error} />;
  }

  if (data == null) {
    return <DataTableSkeleton rows={6} />;
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Filter destinations…"
      initialPageSize={5}
      empty={{ title: "No destinations yet", description: "Ingest CDRs to see top destination countries." }}
    />
  );
}
