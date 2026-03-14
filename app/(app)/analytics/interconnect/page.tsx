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

type PartnerRow = { partnerId: string | null; partnerName: string; amountDue: number; amountPaid: number; variance: number };
type PeriodRow = { periodStart: string; variance: number };

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const partnerColumns: Array<DataTableColumnDef<PartnerRow>> = [
  { accessorKey: "partnerName", header: "Partner", cell: ({ getValue }) => <div className="font-medium">{String(getValue() ?? "—")}</div> },
  { accessorKey: "amountDue", header: "Due", cell: ({ getValue }) => fmtUsd(safeNumber(getValue())) },
  { accessorKey: "amountPaid", header: "Paid", cell: ({ getValue }) => fmtUsd(safeNumber(getValue())) },
  { accessorKey: "variance", header: "Variance", cell: ({ getValue }) => <span className="text-destructive">{fmtUsd(safeNumber(getValue()))}</span> }
];

export default function InterconnectAnalyticsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [partners, setPartners] = React.useState<PartnerRow[] | null>(null);
  const [periods, setPeriods] = React.useState<PeriodRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setPartners(null);
    setPeriods(null);
    try {
      if (!activeOrg?.id) {
        setPartners([]);
        setPeriods([]);
        return;
      }
      const sp = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await fetch(`/api/analytics/interconnect?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load analytics.");

      const p = (body?.data?.partnerVariance ?? []) as any[];
      const b = (body?.data?.varianceByPeriod ?? []) as any[];
      setPartners(
        p.map((r) => ({
          partnerId: r.partnerId ? String(r.partnerId) : null,
          partnerName: String(r.partnerName ?? "—"),
          amountDue: safeNumber(r.amountDue),
          amountPaid: safeNumber(r.amountPaid),
          variance: safeNumber(r.variance)
        })) satisfies PartnerRow[]
      );
      setPeriods(b.map((r) => ({ periodStart: String(r.periodStart), variance: safeNumber(r.variance) })) satisfies PeriodRow[]);
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
      <PageHeader title="Interconnect" description="Track partner settlement variance and interconnect exposure." />

      {error ? <EmptyState title="Could not load analytics" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Partner variance</CardTitle>
            <div className="text-xs text-muted-foreground">Top 20</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {partners == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : partners.length === 0 || partners.every((r) => r.variance === 0) ? (
              <EmptyState title="No settlements data" description="Create settlements to visualize interconnect variance." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={partners.slice(0, 10)} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
                  <XAxis dataKey="partnerName" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={8} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      boxShadow: "0 12px 28px -12px hsl(0 0% 0% / 0.55)"
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    formatter={(value: any) => fmtUsd(safeNumber(value))}
                  />
                  <Bar dataKey="variance" fill="hsl(var(--danger) / 0.75)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="group">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Variance trend</CardTitle>
            <div className="text-xs text-muted-foreground">By period start</div>
          </CardHeader>
          <CardContent className="h-[280px]">
            {periods == null ? (
              <div className="h-full w-full rounded-lg border bg-muted/10 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ) : periods.length === 0 || periods.every((r) => r.variance === 0) ? (
              <EmptyState title="No trend yet" description="Variance will appear once settlements are created." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={periods} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />
                  <XAxis dataKey="periodStart" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={8} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      boxShadow: "0 12px 28px -12px hsl(0 0% 0% / 0.55)"
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    formatter={(value: any) => fmtUsd(safeNumber(value))}
                  />
                  <Line type="monotone" dataKey="variance" stroke="hsl(var(--danger))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="group">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Settlement breakdown</CardTitle>
          <div className="text-xs text-muted-foreground">Selected range</div>
        </CardHeader>
        <CardContent>
          {partners == null ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <DataTable
              columns={partnerColumns}
              data={partners}
              searchPlaceholder="Filter partners…"
              empty={{ title: "No settlements yet", description: "Create partner settlements to see variance and exposure." }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

