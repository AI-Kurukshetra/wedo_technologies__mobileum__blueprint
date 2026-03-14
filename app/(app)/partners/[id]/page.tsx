"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

type Partner = {
  id: string;
  name: string;
  partner_type: string;
  country_code: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = React.useState<Partner | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setData(null);
      try {
        const res = await fetch(`/api/partners/${encodeURIComponent(id)}`);
        const body = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(body?.error ?? "Failed to load partner.");
        if (!cancelled) setData(body?.data as Partner);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load partner.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState title="Could not load partner" description={error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={data ? data.name : "Partner"}
        description="Interconnect partner context used for settlements and variance monitoring."
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
              <CardTitle className="text-sm">Partner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{data.partner_type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Country</span>
                <span className="font-medium">{data.country_code ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{data.contact_email ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{data.contact_phone ?? "—"}</span>
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

