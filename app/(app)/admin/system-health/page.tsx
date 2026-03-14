"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";

type Metric = { key: string; value: number; unit: string | null; recorded_at: string; updated_at: string; metadata: any };

function fmt(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(2).replace(/\.00$/, "");
}

export default function SystemHealthPage() {
  const { activeOrg } = useActiveOrg();
  const [data, setData] = React.useState<Metric[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setData(null);
    try {
      if (!activeOrg?.id) return setData([]);
      const res = await fetch("/api/admin/metrics");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load metrics.");
      setData((body?.data ?? []) as Metric[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load metrics.");
    }
  }, [activeOrg?.id]);

  React.useEffect(() => void load(), [load]);

  React.useEffect(() => {
    function onOrgChanged() {
      void load();
    }
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
  }, [load]);

  const map = React.useMemo(() => new Map((data ?? []).map((m) => [m.key, m])), [data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="System health"
        description="Operational metrics and processing health for the active organization. Many metrics are populated by background jobs (Admin → Jobs) or after CDR imports; 0 or — means no recent activity or the job has not run yet."
        right={
          <Button
            variant="outline"
            className="gap-2"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              try {
                const res = await fetch("/api/admin/jobs/run", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ job: "metricsRefreshJob", scope: "active_org" })
                });
                const body = (await res.json().catch(() => ({}))) as any;
                if (!res.ok) throw new Error(body?.error ?? "Failed to run job.");
                toast.success("Metrics refreshed");
                await load();
              } catch (e: any) {
                toast.error("Refresh failed", { description: e?.message ?? "Unable to refresh metrics." });
              } finally {
                setRunning(false);
              }
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error ? <EmptyState title="Could not load metrics" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-4">
        {[
          ["cdr_ingestion_rate", "CDR ingestion rate"],
          ["processing_latency", "Processing latency"],
          ["alerts_generated", "Alerts generated"],
          ["rules_evaluated", "Rules evaluated"],
          ["pipeline_queue_depth", "Pipeline queue depth"],
          ["pipeline_events_failed", "Pipeline failures"],
          ["open_alerts", "Open alerts"],
          ["enabled_rules", "Enabled rules"],
          ["cdr_aggregation_latency_ms", "Aggregation latency"]
        ].map(([key, label]) => {
          const m = map.get(key);
          return (
            <Card key={key} className="group">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                {data == null ? (
                  <Skeleton className="h-7 w-28" />
                ) : (
                  <div className="text-xl font-semibold">
                    {m ? fmt(Number(m.value ?? 0)) : "—"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">{m?.unit ?? ""}</span>
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">{m?.updated_at ? `Updated ${new Date(m.updated_at).toLocaleString()}` : "—"}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data && data.length === 0 ? (
        <EmptyState title="No metrics yet" description="Click Refresh to compute metrics from current data (open alerts, enabled rules, CDR ingestion rate). Run Admin → Jobs (Rule evaluation, CDR aggregation, Pipeline) to fill the rest." />
      ) : null}

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Why are some values 0 or —?</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li><strong>CDR ingestion rate</strong> — 0 if no CDRs were created in the last 5 minutes.</li>
          <li><strong>Processing latency</strong> — From recent imports with start/end times; seed data often has none, so it shows 0.</li>
          <li><strong>Alerts generated / Rules evaluated</strong> — Filled when the <em>Rule evaluation</em> job runs (Alerts → Run evaluation, or Admin → Jobs).</li>
          <li><strong>Pipeline queue depth / failures</strong> — Filled when the <em>Pipeline</em> job runs.</li>
          <li><strong>Aggregation latency</strong> — Filled when the <em>CDR aggregation</em> job runs.</li>
        </ul>
      </div>
    </div>
  );
}
