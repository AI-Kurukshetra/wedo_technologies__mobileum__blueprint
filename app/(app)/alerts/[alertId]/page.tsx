"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Flag, Link2, ShieldAlert, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AlertDetail = {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: string;
  rule_id: string;
  rule_version_id: string;
  rule_name: string | null;
  window_start_at: string;
  window_end_at: string;
  dimension_type: string;
  dimension_value: string;
  evidence: Record<string, any>;
  assigned_to_user_id: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_type: string | null;
  resolution_reason: string | null;
  created_at: string;
};

type CdrRow = {
  call_start_at: string;
  a_party: string | null;
  b_party: string | null;
  destination_country: string | null;
  duration_seconds: number | null;
  revenue_amount: string | number | null;
};

function safeText(v: unknown) {
  const s = v == null ? "" : String(v).trim();
  return s || "—";
}

function formatWindow(startIso: string, endIso: string) {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    return `${format(start, "PP p")} – ${format(end, "PP p")}`;
  } catch {
    return "—";
  }
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function toNumber(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

const cdrColumns: Array<DataTableColumnDef<CdrRow>> = [
  { accessorKey: "call_start_at", header: "Start", cell: ({ getValue }) => safeText(getValue()) },
  { accessorKey: "a_party", header: "A-party", cell: ({ getValue }) => safeText(getValue()) },
  { accessorKey: "b_party", header: "B-party", cell: ({ getValue }) => safeText(getValue()) },
  { accessorKey: "destination_country", header: "Dest", cell: ({ getValue }) => safeText(getValue()) },
  { accessorKey: "duration_seconds", header: "Sec", cell: ({ getValue }) => safeText(getValue()) },
  {
    accessorKey: "revenue_amount",
    header: "Revenue",
    cell: ({ getValue }) => formatUsd(toNumber(getValue()))
  }
];

export default function AlertDetailPage() {
  const router = useRouter();
  const params = useParams<{ alertId: string }>();
  const alertId = params.alertId;

  const [alert, setAlert] = React.useState<AlertDetail | null>(null);
  const [relatedCdrs, setRelatedCdrs] = React.useState<CdrRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setAlert(null);
    setRelatedCdrs(null);
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load alert.");
      const data = payload?.data as AlertDetail;
      setAlert(data);

      const sp = new URLSearchParams();
      sp.set("from", data.window_start_at);
      sp.set("to", data.window_end_at);
      sp.set("limit", "200");
      if (data.dimension_value && data.dimension_value !== "—") sp.set("q", data.dimension_value);

      const cdrRes = await fetch(`/api/cdr/explorer?${sp.toString()}`);
      const cdrPayload = (await cdrRes.json().catch(() => ({}))) as any;
      if (!cdrRes.ok) throw new Error(cdrPayload?.error ?? "Failed to load related CDRs.");
      const rows = (cdrPayload?.data ?? []) as any[];
      setRelatedCdrs(
        rows.map((r) => ({
          call_start_at: r.call_start_at ? format(new Date(r.call_start_at), "yyyy-MM-dd HH:mm") : "—",
          a_party: r.a_party ?? null,
          b_party: r.b_party ?? null,
          destination_country: r.destination_country ?? null,
          duration_seconds: r.duration_seconds ?? null,
          revenue_amount: r.revenue_amount ?? null
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load alert.");
    }
  }, [alertId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState title="Could not load alert" description={error} />;

  if (!alert) {
    return (
      <div className="space-y-4">
        <PageHeader title="Alert" description="Loading alert details…" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-[140px] rounded-lg border" />
          <Skeleton className="h-[140px] rounded-lg border" />
          <Skeleton className="h-[140px] rounded-lg border" />
        </div>
        <Skeleton className="h-[320px] rounded-lg border" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={alert.title}
        description={alert.rule_name ? `Rule: ${alert.rule_name}` : "Alert details and evidence"}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                const res = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/acknowledge`, { method: "POST" });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast.error(payload?.error ?? "Failed to acknowledge");
                  return;
                }
                toast.success("Acknowledged");
                await load();
              }}
              disabled={alert.status !== "new"}
            >
              <CheckCircle2 className="h-4 w-4" />
              Acknowledge
            </Button>

            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                const me = await fetch("/api/me").then((r) => r.json()).catch(() => null);
                const myId = me?.user?.id ?? null;
                if (!myId) return toast.error("Could not determine current user");
                const res = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/assign`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ assignedToUserId: myId })
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast.error(payload?.error ?? "Failed to assign");
                  return;
                }
                toast.success("Assigned");
                await load();
              }}
            >
              <UserPlus className="h-4 w-4" />
              Assign to me
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={alert.status === "resolved" || alert.status === "false_positive"}>
                  <ShieldAlert className="h-4 w-4" />
                  Resolve
                </Button>
              </DialogTrigger>
              <ResolveDialog alertId={alert.id} mode="resolved" onDone={load} />
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={alert.status === "resolved" || alert.status === "false_positive"}>
                  <Flag className="h-4 w-4" />
                  False positive
                </Button>
              </DialogTrigger>
              <ResolveDialog alertId={alert.id} mode="false_positive" onDone={load} />
            </Dialog>

            <Button
              className="gap-2"
              onClick={() => router.push(`/cases?alertId=${encodeURIComponent(alert.id)}`)}
            >
              <Link2 className="h-4 w-4" />
              Create case
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Severity</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <AlertSeverityBadge severity={alert.severity} />
            <StatusBadge label={alert.status} variant="outline" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Window</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatWindow(alert.window_start_at, alert.window_end_at)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Dimension: <span className="font-medium text-foreground">{alert.dimension_type}</span> ={" "}
              <span className="font-medium text-foreground">{alert.dimension_value}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{alert.assigned_to_user_id ? "Assigned" : "Unassigned"}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {alert.assigned_to_user_id ? safeText(alert.assigned_to_user_id) : "Assign to route investigations."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md border bg-muted/10 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Calls</div>
                <div className="text-sm font-semibold">{safeText(alert.evidence?.calls ?? alert.evidence?.count ?? "—")}</div>
              </div>
              <div className="rounded-md border bg-muted/10 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Threshold</div>
                <div className="text-sm font-semibold">{safeText(alert.evidence?.threshold ?? "—")}</div>
              </div>
            </div>
            <pre className="max-h-[260px] overflow-auto rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
{JSON.stringify(alert.evidence ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Related CDRs</CardTitle>
          </CardHeader>
          <CardContent>
            {relatedCdrs == null ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <>
                <div className="mb-2 text-xs text-muted-foreground">
                  Showing up to 200 records in the alert window.{" "}
                  <Link
                    href="/cdr/explorer"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Open explorer
                  </Link>
                </div>
                <DataTable
                  columns={cdrColumns}
                  data={relatedCdrs}
                  initialPageSize={5}
                  searchPlaceholder="Filter related CDRs…"
                  empty={{ title: "No related CDRs", description: "Try widening the alert window or ingest more data." }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResolveDialog({ alertId, mode, onDone }: { alertId: string; mode: "resolved" | "false_positive"; onDone: () => Promise<void> | void }) {
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  return (
    <DialogContent>
      <div className="border-b px-6 py-4">
        <div className="text-sm font-semibold">{mode === "false_positive" ? "Mark false positive" : "Resolve alert"}</div>
        <div className="mt-1 text-xs text-muted-foreground">Provide a resolution reason for audit and reporting.</div>
      </div>
      <div className="space-y-3 px-6 py-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="resolution_reason">
            Reason
          </label>
          <Textarea
            id="resolution_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={mode === "false_positive" ? "Why is this a false positive?" : "How was this resolved?"}
            disabled={loading}
          />
        </div>
        <Button
          disabled={loading || !reason.trim()}
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/resolve`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ resolutionType: mode, resolutionReason: reason.trim() })
              });
              const payload = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(payload?.error ?? "Failed to resolve.");
              toast.success(mode === "false_positive" ? "Marked false positive" : "Resolved");
              await onDone();
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Saving…" : "Save"}
        </Button>
      </div>
    </DialogContent>
  );
}

