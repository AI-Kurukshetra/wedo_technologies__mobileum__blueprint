"use client";

import * as React from "react";
import { ResponsiveContainer, Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Point = { d: string; revenue: number };

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function RevenueTrendChart() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [data, setData] = React.useState<Point[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const to = new Date(toIso);
      const clampedEnd = new Date(Math.min(to.getTime(), Date.now()));
      const from = new Date(fromIso);
      const rawStart = new Date(clampedEnd.getTime() - 13 * 24 * 60 * 60 * 1000);
      const clampedStart = new Date(Math.max(rawStart.getTime(), from.getTime()));

      const days: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(clampedEnd.getTime() - i * 24 * 60 * 60 * 1000);
        days.push(dayKey(d));
      }

      const totals = new Map<string, number>(days.map((d) => [d, 0]));

      const sp = new URLSearchParams();
      sp.set("from", clampedStart.toISOString());
      sp.set("to", clampedEnd.toISOString());
      const res = await fetch(`/api/dashboard/revenue-trend?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load revenue trend.");
      const rows = (body?.data ?? []) as Array<{ day: string; revenue: unknown }>;

      for (const row of (rows ?? []) as Array<{ day: string; revenue: unknown }>) {
        const key = row.day ? String(row.day) : "";
        if (!key || !totals.has(key)) continue;
        totals.set(key, safeNumber(row.revenue));
      }

      const points: Point[] = days.map((d) => ({ d, revenue: Math.round(totals.get(d) ?? 0) }));
      setData(points);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load revenue trend.");
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

  return (
    <Card className="group">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Revenue trend</CardTitle>
        <div className="text-xs text-muted-foreground">Last 14d</div>
      </CardHeader>
      <CardContent className="h-[240px]">
        {error ? (
          <EmptyState title="Could not load chart" description={error} />
        ) : data == null ? (
          <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
            <Skeleton className="h-full w-full" />
          </div>
        ) : data.every((p) => p.revenue === 0) ? (
          <EmptyState title="No revenue trend yet" description="Ingest CDRs to see revenue totals over time." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
              <XAxis
                dataKey="d"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickMargin={8}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                width={44}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  boxShadow: "0 12px 28px -12px hsl(0 0% 0% / 0.55)"
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
