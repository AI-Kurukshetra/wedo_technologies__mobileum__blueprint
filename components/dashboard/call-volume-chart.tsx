"use client";

import * as React from "react";
import { ResponsiveContainer, Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Point = { t: string; calls: number };

function isoHourLabel(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function startOfHour(d: Date) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

export function CallVolumeChart() {
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
      const rawStart = new Date(clampedEnd.getTime() - 24 * 60 * 60 * 1000);
      const clampedStart = new Date(Math.max(rawStart.getTime(), from.getTime()));
      const bucketStart = startOfHour(clampedStart);
      const bucketCount = Math.max(
        1,
        Math.min(24, Math.ceil((clampedEnd.getTime() - bucketStart.getTime()) / (60 * 60 * 1000)) + 1)
      );

      const buckets: Point[] = Array.from({ length: bucketCount }).map((_, i) => {
        const t = new Date(bucketStart.getTime() + i * 60 * 60 * 1000);
        return { t: isoHourLabel(t), calls: 0 };
      });

      const sp = new URLSearchParams();
      sp.set("from", bucketStart.toISOString());
      sp.set("to", clampedEnd.toISOString());
      const res = await fetch(`/api/dashboard/call-volume?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load call volume.");
      const rows = (body?.data ?? []) as Array<{ hour: string; calls: number }>;

      for (const row of (rows ?? []) as Array<{ hour: string; calls: number }>) {
        const at = row.hour ? new Date(row.hour) : null;
        if (!at || Number.isNaN(at.getTime())) continue;
        const idx = Math.floor((startOfHour(at).getTime() - bucketStart.getTime()) / (60 * 60 * 1000));
        if (idx >= 0 && idx < buckets.length) buckets[idx].calls = Number(row.calls ?? 0);
      }

      setData(buckets);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load call volume.");
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
        <CardTitle className="text-sm">Call volume</CardTitle>
        <div className="text-xs text-muted-foreground">Last 24h</div>
      </CardHeader>
      <CardContent className="h-[240px]">
        {error ? (
          <EmptyState title="Could not load chart" description={error} />
        ) : data == null ? (
          <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
            <Skeleton className="h-full w-full" />
          </div>
        ) : data.every((p) => p.calls === 0) ? (
          <EmptyState title="No calls in the last 24 hours" description="Ingest CDRs to see call volume over time." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
              <XAxis
                dataKey="t"
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
              <defs>
                <linearGradient id="callsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--info))" stopOpacity={0.38} />
                  <stop offset="100%" stopColor="hsl(var(--info))" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="calls"
                stroke="hsl(var(--info))"
                fill="url(#callsFill)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
