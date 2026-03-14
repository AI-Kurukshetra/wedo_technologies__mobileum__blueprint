"use client";

import * as React from "react";
import { ResponsiveContainer, Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";

type Daily = { day: string; calls: number; revenue: number };
type Country = { country: string; calls: number; revenue: number; avgDurationSeconds: number };

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const countryColumns: Array<DataTableColumnDef<Country>> = [
  { accessorKey: "country", header: "Destination", cell: ({ getValue }) => <div className="font-medium">{String(getValue() ?? "—")}</div> },
  { accessorKey: "calls", header: "Calls" },
  { accessorKey: "revenue", header: "Revenue", cell: ({ getValue }) => fmtUsd(safeNumber(getValue())) },
  { accessorKey: "avgDurationSeconds", header: "Avg dur (s)" }
];

export default function RoamingAnalyticsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [daily, setDaily] = React.useState<Daily[] | null>(null);
  const [top, setTop] = React.useState<Country[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setDaily(null);
    setTop(null);
    try {
      if (!activeOrg?.id) {
        setDaily([]);
        setTop([]);
        return;
      }
      const sp = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await fetch(`/api/analytics/roaming?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load analytics.");

      const d = (body?.data?.internationalDaily ?? []) as any[];
      const t = (body?.data?.topCountries ?? []) as any[];
      setDaily(
        d.map((r) => ({ day: String(r.day), calls: safeNumber(r.calls), revenue: safeNumber(r.revenue) })) satisfies Daily[]
      );
      setTop(
        t.map((r) => ({
          country: String(r.country),
          calls: safeNumber(r.calls),
          revenue: safeNumber(r.revenue),
          avgDurationSeconds: safeNumber(r.avgDurationSeconds)
        })) satisfies Country[]
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics.");
    }
  }, [activeOrg?.id, fromIso, toIso]);

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
      <PageHeader title="Roaming" description="Track international activity and detect unusual destination shifts." />

      {error ? <EmptyState title="Could not load analytics" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">International calls</CardTitle>
            <div className="text-xs text-muted-foreground">Daily</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {daily == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : daily.length === 0 || daily.every((p) => p.calls === 0) ? (
              <EmptyState title="No international activity" description="Ingest CDRs to see destination changes over time." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={8} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      boxShadow: "0 12px 28px -12px hsl(0 0% 0% / 0.55)"
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="calls" stroke="hsl(var(--info))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Top destinations (revenue)</CardTitle>
            <div className="text-xs text-muted-foreground">Selected range</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {top == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : top.length === 0 ? (
              <EmptyState title="No destinations yet" description="International destinations appear once CDRs are ingested." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
                  <XAxis dataKey="country" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={8} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      boxShadow: "0 12px 28px -12px hsl(0 0% 0% / 0.55)"
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--success) / 0.75)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="group">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Destination breakdown</CardTitle>
          <div className="text-xs text-muted-foreground">International only</div>
        </CardHeader>
        <CardContent>
          {top == null ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <DataTable
              columns={countryColumns}
              data={top}
              searchPlaceholder="Filter destinations…"
              empty={{ title: "No destinations yet", description: "International destinations appear once CDRs are ingested." }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

