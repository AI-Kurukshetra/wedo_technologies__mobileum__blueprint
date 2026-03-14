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
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";

type Sev = { severity: AlertSeverity; count: number };
type Dim = { dimensionType: string; dimensionValue: string; count: number };
type Trend = { day: string; alerts: number };

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

const dimColumns: Array<DataTableColumnDef<Dim>> = [
  { accessorKey: "dimensionType", header: "Type" },
  { accessorKey: "dimensionValue", header: "Value", cell: ({ getValue }) => <div className="font-medium">{String(getValue() ?? "—")}</div> },
  { accessorKey: "count", header: "Alerts" }
];

export default function FraudPatternsAnalyticsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [sev, setSev] = React.useState<Sev[] | null>(null);
  const [dims, setDims] = React.useState<Dim[] | null>(null);
  const [trend, setTrend] = React.useState<Trend[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setSev(null);
    setDims(null);
    setTrend(null);
    try {
      if (!activeOrg?.id) {
        setSev([]);
        setDims([]);
        setTrend([]);
        return;
      }
      const sp = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await fetch(`/api/analytics/fraud-patterns?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load analytics.");

      const s = (body?.data?.alertsBySeverity ?? []) as any[];
      const d = (body?.data?.topDimensions ?? []) as any[];
      const t = (body?.data?.trend ?? []) as any[];

      setSev(s.map((r) => ({ severity: String(r.severity) as any, count: safeNumber(r.count) })) satisfies Sev[]);
      setDims(d.map((r) => ({ dimensionType: String(r.dimensionType), dimensionValue: String(r.dimensionValue), count: safeNumber(r.count) })) satisfies Dim[]);
      setTrend(t.map((r) => ({ day: String(r.day), alerts: safeNumber(r.alerts) })) satisfies Trend[]);
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

  const sevBarData = React.useMemo(() => {
    const order: AlertSeverity[] = ["low", "medium", "high", "critical"];
    const map = new Map(sev?.map((s) => [s.severity, s.count]) ?? []);
    return order.map((k) => ({ severity: k, count: map.get(k) ?? 0 }));
  }, [sev]);

  return (
    <div className="space-y-4">
      <PageHeader title="Fraud patterns" description="Understand where alerts concentrate by severity and dimension." />

      {error ? <EmptyState title="Could not load analytics" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Alerts by severity (open)</CardTitle>
            <div className="text-xs text-muted-foreground">Selected range</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {sev == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : sevBarData.every((r) => r.count === 0) ? (
              <EmptyState title="No open alerts" description="Enable rules or run evaluations to generate alerts." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sevBarData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
                  <XAxis dataKey="severity" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={8} axisLine={false} tickLine={false} />
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
                  <Bar dataKey="count" fill="hsl(var(--info) / 0.75)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Alert trend</CardTitle>
            <div className="text-xs text-muted-foreground">Daily</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {trend == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : trend.length === 0 || trend.every((r) => r.alerts === 0) ? (
              <EmptyState title="No alerts yet" description="Once alerts are generated, trends appear here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
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
                  <Line type="monotone" dataKey="alerts" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="group">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Top dimensions</CardTitle>
          <div className="text-xs text-muted-foreground">Most frequent alert dimensions</div>
        </CardHeader>
        <CardContent>
          {dims == null ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <DataTable
              columns={[
                {
                  accessorKey: "dimensionType",
                  header: "Type"
                },
                {
                  accessorKey: "dimensionValue",
                  header: "Value",
                  cell: ({ getValue }) => <div className="max-w-[460px] truncate font-medium">{String(getValue() ?? "—")}</div>
                },
                {
                  accessorKey: "count",
                  header: "Alerts"
                }
              ]}
              data={dims}
              searchPlaceholder="Filter dimensions…"
              empty={{ title: "No patterns yet", description: "Generate alerts to see concentration by dimension." }}
            />
          )}
          {sev && sev.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {sevBarData.map((s) => (
                <div key={s.severity} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1 text-xs">
                  <AlertSeverityBadge severity={s.severity} />
                  <span className="text-muted-foreground">{s.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

