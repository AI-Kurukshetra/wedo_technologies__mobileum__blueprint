"use client";

import * as React from "react";
import { Bell, DollarSign, PhoneCall, Timer, TrendingUp } from "lucide-react";

import { KPIStatCard } from "@/components/KPIStatCard";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";

type Kpis = {
  calls: number;
  revenue: number;
  durationSeconds: number;
  margin: number;
  openAlerts: number;
  revenueRecovered: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function safeNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function DashboardKpis() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [kpis, setKpis] = React.useState<Kpis | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      const res = await fetch(`/api/dashboard/kpis?${sp.toString()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load KPIs.");
      const payload: any = body?.data ?? {};
      const calls = safeNumber(payload.calls);
      const revenue = safeNumber(payload.revenue);
      const durationSeconds = safeNumber(payload.duration ?? payload.duration_seconds);
      const margin = safeNumber(payload.margin);
      const openAlerts = safeNumber(payload.alerts ?? payload.open_alerts);
      const revenueRecovered = safeNumber(payload.revenue_recovered);

      setKpis({ calls, revenue, durationSeconds, margin, openAlerts, revenueRecovered });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load KPIs.");
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
    return (
      <EmptyState
        title="Could not load KPIs"
        description={error}
        className="md:col-span-2 lg:col-span-5"
      />
    );
  }

  if (!kpis) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card shadow-elev-1">
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
              </div>
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
            <div className="px-4 pb-4">
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const durationHours = Math.round(kpis.durationSeconds / 3600);

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
      <KPIStatCard label="Calls" value={formatNumber(kpis.calls)} icon={<PhoneCall className="h-4 w-4" />} />
      <KPIStatCard label="Revenue" value={formatUsd(kpis.revenue)} icon={<DollarSign className="h-4 w-4" />} />
      <KPIStatCard label="Duration" value={`${formatNumber(durationHours)}h`} icon={<Timer className="h-4 w-4" />} />
      <KPIStatCard label="Margin" value={formatUsd(kpis.margin)} icon={<TrendingUp className="h-4 w-4" />} />
      <KPIStatCard label="Alerts" value={formatNumber(kpis.openAlerts)} icon={<Bell className="h-4 w-4" />} />
      <KPIStatCard label="Recovered" value={formatUsd(kpis.revenueRecovered)} icon={<DollarSign className="h-4 w-4" />} />
    </div>
  );
}
