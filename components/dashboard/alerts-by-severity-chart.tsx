"use client";

import * as React from "react";
import { ResponsiveContainer, Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Point = { severity: string; count: number; color: string };

const severityOrder = ["low", "medium", "high", "critical"] as const;
const severityLabel: Record<(typeof severityOrder)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};
const severityColor: Record<(typeof severityOrder)[number], string> = {
  low: "hsl(var(--muted-foreground))",
  medium: "hsl(var(--info))",
  high: "hsl(var(--warning))",
  critical: "hsl(var(--danger))"
};

export function AlertsBySeverityChart() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [data, setData] = React.useState<Point[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      const res = await fetch(`/api/dashboard/alerts-by-severity?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load alerts by severity.");
      const rows = (body?.data ?? []) as Array<{ severity: string; count: number }>;

      const counts = new Map<string, number>(severityOrder.map((s) => [s, 0]));
      for (const row of (rows ?? []) as Array<{ severity: string; count: number }>) {
        const sev = (row.severity ?? "") as string;
        if (counts.has(sev)) counts.set(sev, Number(row.count ?? 0));
      }

      const points: Point[] = severityOrder.map((s) => ({
        severity: severityLabel[s],
        count: counts.get(s) ?? 0,
        color: severityColor[s]
      }));

      setData(points);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load alerts by severity.");
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
        <CardTitle className="text-sm">Alerts by severity</CardTitle>
        <div className="text-xs text-muted-foreground">Open</div>
      </CardHeader>
      <CardContent className="h-[240px]">
        {error ? (
          <EmptyState title="Could not load chart" description={error} />
        ) : data == null ? (
          <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
            <Skeleton className="h-full w-full" />
          </div>
        ) : data.every((p) => p.count === 0) ? (
          <EmptyState title="No open alerts" description="When rules trigger, you’ll see severity breakdowns here." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
              <XAxis
                dataKey="severity"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickMargin={8}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                width={36}
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
              <Bar dataKey="count" radius={[10, 10, 6, 6]}>
                {data.map((entry) => (
                  <Cell key={entry.severity} fill={entry.color} opacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
