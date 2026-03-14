"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Paperclip, Save, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

type CaseRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: AlertSeverity;
  priority: string;
  sla_deadline: string | null;
  outcome: string | null;
  resolution_notes: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type LinkedAlert = { id: string; title: string | null; severity: AlertSeverity | null; status: string | null; created_at: string | null };
type CaseEvent = { id: string; event_type: string; message: string | null; actor_user_id: string | null; created_at: string };
type Attachment = { id: string; filename: string; content_type: string | null; bytes: number | null; storage_object_path: string; created_at: string };

type Payload = { case: CaseRow; linkedAlerts: LinkedAlert[]; events: CaseEvent[]; attachments: Attachment[] };

function safeText(v: unknown) {
  const s = v == null ? "" : String(v).trim();
  return s || "—";
}

const linkedAlertColumns: Array<DataTableColumnDef<LinkedAlert>> = [
  { accessorKey: "created_at", header: "Created", cell: ({ getValue }) => {
    const v = String(getValue() ?? "");
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return formatDistanceToNowStrict(d, { addSuffix: true });
  }},
  { accessorKey: "title", header: "Alert", cell: ({ getValue }) => <div className="max-w-[420px] truncate font-medium">{safeText(getValue())}</div> },
  { accessorKey: "severity", header: "Severity", cell: ({ row }) => <AlertSeverityBadge severity={(row.original.severity ?? "medium") as any} /> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={safeText(getValue())} variant="outline" /> }
];

export default function CaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;

  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [priority, setPriority] = React.useState("medium");
  const [slaDeadline, setSlaDeadline] = React.useState<string>("");
  const [outcome, setOutcome] = React.useState("");
  const [resolutionNotes, setResolutionNotes] = React.useState("");
  const [recoveredAmount, setRecoveredAmount] = React.useState("");
  const [recordingRecovery, setRecordingRecovery] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load case.");
      const p = payload?.data as Payload;
      setData(p);
      setPriority(p.case.priority ?? "medium");
      setSlaDeadline(p.case.sla_deadline ? p.case.sla_deadline.slice(0, 16) : "");
      setOutcome(p.case.outcome ?? "");
      setResolutionNotes(p.case.resolution_notes ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load case.");
    }
  }, [caseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState title="Could not load case" description={error} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Case" description="Loading case details…" />
        <Skeleton className="h-[160px] rounded-lg border" />
        <Skeleton className="h-[360px] rounded-lg border" />
      </div>
    );
  }

  const c = data.case;

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.title}
        description="Case summary, linked alerts, timeline, attachments."
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                const me = await fetch("/api/me").then((r) => r.json()).catch(() => null);
                const myId = me?.user?.id ?? null;
                if (!myId) return toast.error("Could not determine current user");
                const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ owner_user_id: myId })
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) return toast.error(payload?.error ?? "Failed to assign");
                toast.success("Assigned");
                await load();
              }}
            >
              <UserPlus className="h-4 w-4" />
              Assign to me
            </Button>
            <Button
              className="gap-2"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      priority,
                      sla_deadline: slaDeadline ? new Date(slaDeadline).toISOString() : null,
                      outcome: outcome || null,
                      resolution_notes: resolutionNotes || null
                    })
                  });
                  const payload = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(payload?.error ?? "Failed to save case.");
                  toast.success("Saved");
                  await load();
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Save className="h-4 w-4" />
              Save
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
            <StatusBadge label={c.status} variant="outline" />
            <AlertSeverityBadge severity={c.severity} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Owner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{c.owner_user_id ? "Assigned" : "Unassigned"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.owner_user_id ? safeText(c.owner_user_id) : "Assign an owner to track SLA."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{format(new Date(c.updated_at), "PP p")}</div>
            <div className="mt-1 text-xs text-muted-foreground">Created {format(new Date(c.created_at), "PP p")}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Case details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="priority">
                  Priority
                </label>
                <Input id="priority" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="medium" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="sla">
                  SLA deadline
                </label>
                <Input
                  id="sla"
                  type="datetime-local"
                  value={slaDeadline}
                  onChange={(e) => setSlaDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="outcome">
                Outcome
              </label>
              <Input id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Blocked route, refunded customer" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="notes">
                Resolution notes
              </label>
              <Textarea id="notes" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Add investigation summary and resolution steps…" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Linked alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={linkedAlertColumns}
              data={data.linkedAlerts}
              initialPageSize={5}
              searchPlaceholder="Filter linked alerts…"
              getRowHref={(r) => `/alerts/${encodeURIComponent((r as any).id)}`}
              empty={{ title: "No linked alerts", description: "Link alerts to this case to investigate root cause." }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Revenue recovery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="recovery_amount">
                Recovered amount (USD)
              </label>
              <Input
                id="recovery_amount"
                type="number"
                step="0.01"
                min={0}
                value={recoveredAmount}
                onChange={(e) => setRecoveredAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button
              variant="outline"
              disabled={recordingRecovery || !recoveredAmount.trim()}
              onClick={async () => {
                const amount = Number(recoveredAmount);
                if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid positive amount");
                setRecordingRecovery(true);
                try {
                  const res = await fetch("/api/revenue-recovery", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ caseId, amount, currency: "USD" })
                  });
                  const payload = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(payload?.error ?? "Failed to record recovery.");
                  toast.success("Revenue recovery recorded");
                  setRecoveredAmount("");
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to record recovery.");
                } finally {
                  setRecordingRecovery(false);
                }
              }}
            >
              {recordingRecovery ? "Recording…" : "Record recovery"}
            </Button>
            <div className="text-xs text-muted-foreground">Recorded values are available in analytics and report exports.</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Timeline</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-9">
                  Add note
                </Button>
              </DialogTrigger>
              <AddNoteDialog caseId={caseId} onDone={load} />
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.events.length ? (
              <div className="space-y-2">
                {data.events.map((ev) => (
                  <div key={ev.id} className="rounded-md border bg-muted/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-muted-foreground">{safeText(ev.event_type)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(ev.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="mt-1 text-sm">{safeText(ev.message)}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{ev.actor_user_id ? safeText(ev.actor_user_id) : "System"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No timeline events yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Attachments</CardTitle>
            <AttachmentUpload caseId={caseId} onUploaded={load} />
          </CardHeader>
          <CardContent className="space-y-2">
            {data.attachments.length ? (
              data.attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.filename}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(a.created_at), "PP p")}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.content_type ?? "—"}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No attachments uploaded.</div>
            )}
            <div className="pt-1 text-xs text-muted-foreground">
              Bucket: <span className="font-medium text-foreground">case-attachments</span>. If uploads fail, create the bucket in Supabase Storage.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        <Link href="/cases" className="hover:text-foreground">
          Back to Cases
        </Link>
      </div>
    </div>
  );
}

function AddNoteDialog({ caseId, onDone }: { caseId: string; onDone: () => Promise<void> | void }) {
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  return (
    <DialogContent>
      <div className="border-b px-6 py-4">
        <div className="text-sm font-semibold">Add note</div>
        <div className="mt-1 text-xs text-muted-foreground">Notes appear in the case timeline.</div>
      </div>
      <div className="space-y-3 px-6 py-4">
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Investigation update…" disabled={loading} />
        <Button
          disabled={loading || !message.trim()}
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/events`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ eventType: "note", message: message.trim() })
              });
              const payload = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(payload?.error ?? "Failed to add note.");
              toast.success("Note added");
              setMessage("");
              await onDone();
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Saving…" : "Add note"}
        </Button>
      </div>
    </DialogContent>
  );
}

function AttachmentUpload({ caseId, onUploaded }: { caseId: string; onUploaded: () => Promise<void> | void }) {
  const [uploading, setUploading] = React.useState(false);

  return (
    <label className="inline-flex">
      <input
        type="file"
        className="hidden"
        disabled={uploading}
        onChange={async (e) => {
          const file = e.target.files?.[0] ?? null;
          if (!file) return;
          setUploading(true);
          try {
            const res = await fetch("/api/attachments", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ caseId, filename: file.name, contentType: file.type })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.error ?? "Failed to create attachment.");
            const signedUrl = payload?.signedUrl as string | null;
            if (!signedUrl) throw new Error("Missing signedUrl");

            const put = await fetch(signedUrl, {
              method: "PUT",
              headers: {
                "content-type": file.type || "application/octet-stream",
                "x-upsert": "true"
              },
              body: file
            });
            if (!put.ok) throw new Error("Upload failed");

            toast.success("Uploaded");
            await onUploaded();
          } catch (err: any) {
            toast.error(err?.message ?? "Upload failed");
          } finally {
            setUploading(false);
            e.target.value = "";
          }
        }}
      />
      <Button variant="outline" className="h-9 gap-2" disabled={uploading}>
        <Paperclip className="h-4 w-4" />
        {uploading ? "Uploading…" : "Upload"}
      </Button>
    </label>
  );
}

