"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

type ImportRow = {
  id: string;
  status: string;
  source: string;
  original_filename: string | null;
  storage_object_path: string;
  started_at: string | null;
  finished_at: string | null;
  row_count_total: number;
  row_count_ok: number;
  row_count_failed: number;
  error_summary: string | null;
  created_at: string;
};

function fmtWhen(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export default function CdrImportDetailPage() {
  const params = useParams<{ importId: string }>();
  const importId = params.importId;

  const [data, setData] = React.useState<ImportRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setData(null);
      try {
        const res = await fetch(`/api/cdr/imports/${encodeURIComponent(importId)}`);
        const payload = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(payload?.error ?? "Failed to load import.");
        if (!cancelled) setData(payload?.data as ImportRow);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load import.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importId]);

  if (error) return <EmptyState title="Could not load import" description={error} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Import" description="Loading import…" />
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm">
                  <Skeleton className="h-4 w-24" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-28" />
                <Skeleton className="mt-2 h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const isFailed = data.status === "failed";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import details"
        description={data.original_filename ? data.original_filename : "CDR import"}
        right={
          <div className="flex items-center gap-2">
            {isFailed ? (
              <Button variant="outline" disabled title="Retry is not implemented for this import source yet.">
                Retry
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/cdr/imports">Back</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <StatusBadge label={data.status} variant="outline" />
            <div className="text-xs text-muted-foreground">{data.source}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Rows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{(data.row_count_ok ?? 0).toLocaleString()} OK</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {(data.row_count_failed ?? 0).toLocaleString()} failed • {(data.row_count_total ?? 0).toLocaleString()} total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Timing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">Created {fmtWhen(data.created_at)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Started {fmtWhen(data.started_at)} • Finished {fmtWhen(data.finished_at)}
            </div>
          </CardContent>
        </Card>
      </div>

      {data.error_summary ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              {data.error_summary}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Errors</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">No error summary for this import.</CardContent>
        </Card>
      )}
    </div>
  );
}

