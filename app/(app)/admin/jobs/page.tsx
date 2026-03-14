"use client";

import * as React from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

const jobs = [
  { name: "cdrAggregationJob", label: "CDR aggregation", schedule: "every 5 minutes" },
  { name: "ruleEvaluationJob", label: "Rule evaluation", schedule: "every 2 minutes" },
  { name: "alertEscalationJob", label: "Alert escalation", schedule: "every 10 minutes" },
  { name: "metricsRefreshJob", label: "Metrics refresh", schedule: "every 5 minutes" },
  { name: "scheduledReportsJob", label: "Scheduled reports", schedule: "every 15 minutes" },
  { name: "realtimePipelineJob", label: "Real-time pipeline", schedule: "every 1 minute" }
];

export default function AdminJobsPage() {
  const [running, setRunning] = React.useState<string | null>(null);
  const [last, setLast] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Jobs" description="Run scheduled background jobs manually (scope: active org)." />

      {error ? <EmptyState title="Job failed" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {jobs.map((j) => (
          <Card key={j.name} className="group">
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm">{j.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">Schedule: {j.schedule}</div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                disabled={!!running}
                onClick={async () => {
                  setError(null);
                  setRunning(j.name);
                  try {
                    const res = await fetch("/api/admin/jobs/run", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ job: j.name, scope: "active_org" })
                    });
                    const body = (await res.json().catch(() => ({}))) as any;
                    if (!res.ok) throw new Error(body?.error ?? "Failed to run job.");
                    toast.success("Job completed", { description: j.label });
                    setLast({ job: j.name, result: body?.result ?? null, at: new Date().toISOString() });
                  } catch (e: any) {
                    setError(e?.message ?? "Failed to run job.");
                  } finally {
                    setRunning(null);
                  }
                }}
              >
                <Play className="h-4 w-4" />
                Run
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {last ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Last run</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              {last.job} • {new Date(last.at).toLocaleString()}
            </div>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              {JSON.stringify(last.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
