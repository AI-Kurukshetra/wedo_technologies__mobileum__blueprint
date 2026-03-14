"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

type Subscriber = {
  id: string;
  msisdn: string;
  status: string;
  imsi: string | null;
  imei: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export default function SubscriberDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = React.useState<Subscriber | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setData(null);
      try {
        const res = await fetch(`/api/subscribers/${encodeURIComponent(id)}`);
        const body = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(body?.error ?? "Failed to load subscriber.");
        if (!cancelled) setData(body?.data as Subscriber);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load subscriber.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState title="Could not load subscriber" description={error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={data ? data.msisdn : "Subscriber"}
        description="Subscriber context (msisdn/imsi/imei) used for investigations."
        right={
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back</Link>
          </Button>
        }
      />

      {!data ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">
              <Skeleton className="h-4 w-28" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm">Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">MSISDN</span>
                <span className="font-medium">{data.msisdn}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{data.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">IMSI</span>
                <span className="font-medium">{data.imsi ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">IMEI</span>
                <span className="font-medium">{data.imei ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                {JSON.stringify(data.metadata ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

