"use client";

import * as React from "react";
import { ResponsiveContainer, Area, AreaChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Point = {
  day: string;
  revenue: number;
  cost: number;
  margin: number;
  leakage: number;
  marginPct: number;
};

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function RevenueLeakageAnalyticsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [data, setData] = React.useState<Point[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setData(null);
    try {
      if (!activeOrg?.id) return setData([]);
      const sp = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await fetch(`/api/analytics/revenue-leakage?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load analytics.");
      const series = (body?.data?.series ?? []) as any[];
      const points: Point[] = series.map((r) => ({
        day: String(r.day),
        revenue: safeNumber(r.revenue),
        cost: safeNumber(r.cost),
        margin: safeNumber(r.margin),
        leakage: safeNumber(r.leakage),
        marginPct: safeNumber(r.marginPct)
      }));
      setData(points);
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

  const totals = React.useMemo(() => {
    const rows = data ?? [];
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const cost = rows.reduce((a, r) => a + r.cost, 0);
    const margin = rows.reduce((a, r) => a + r.margin, 0);
    const leakage = rows.reduce((a, r) => a + r.leakage, 0);
    const marginPct = revenue === 0 ? 0 : Math.round((margin / revenue) * 10000) / 100;
    return { revenue, cost, margin, leakage, marginPct };
  }, [data]);

  return (
    <div className="space-y-4">
      <PageHeader title="Revenue leakage" description="Monitor margin compression and negative-margin leakage over time." />

      {error ? <EmptyState title="Could not load analytics" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-4">
        <Card className="group">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {data == null ? <Skeleton className="h-7 w-28" /> : <div className="text-xl font-semibold">{fmtUsd(totals.revenue)}</div>}
            <div className="mt-1 text-xs text-muted-foreground">Selected range</div>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Cost</CardTitle>
          </CardHeader>
          <CardContent>
            {data == null ? <Skeleton className="h-7 w-28" /> : <div className="text-xl font-semibold">{fmtUsd(totals.cost)}</div>}
            <div className="mt-1 text-xs text-muted-foreground">Selected range</div>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Margin</CardTitle>
          </CardHeader>
          <CardContent>
            {data == null ? <Skeleton className="h-7 w-28" /> : <div className="text-xl font-semibold">{fmtUsd(totals.margin)}</div>}
            <div className="mt-1 text-xs text-muted-foreground">Margin% {totals.marginPct.toFixed(2)}%</div>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Leakage</CardTitle>
          </CardHeader>
          <CardContent>
            {data == null ? <Skeleton className="h-7 w-28" /> : <div className="text-xl font-semibold text-destructive">{fmtUsd(totals.leakage)}</div>}
            <div className="mt-1 text-xs text-muted-foreground">Negative-margin amount</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Leakage trend</CardTitle>
            <div className="text-xs text-muted-foreground">Daily</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {data == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : data.length === 0 || data.every((p) => p.leakage === 0) ? (
              <EmptyState title="No leakage detected" description="Ingest CDRs to compute cost vs revenue leakage." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
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
                  <Area type="monotone" dataKey="leakage" stroke="hsl(var(--danger))" fill="hsl(var(--danger) / 0.18)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Revenue vs cost</CardTitle>
            <div className="text-xs text-muted-foreground">Daily</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {data == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : data.length === 0 || data.every((p) => p.revenue === 0 && p.cost === 0) ? (
              <EmptyState title="No revenue yet" description="Ingest CDRs to see revenue/cost trends." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
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
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cost" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

