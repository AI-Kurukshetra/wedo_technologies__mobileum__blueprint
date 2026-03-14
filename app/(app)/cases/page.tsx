"use client";

import { toast } from "sonner";
import { Plus } from "lucide-react";
import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";
import {
  Dialog,
  DialogContent,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Row = { id: string; title: string; status: string; severity: AlertSeverity; owner: string; updatedAt: string; alerts: number };

const columns: Array<DataTableColumnDef<Row>> = [
  { accessorKey: "title", header: "Case", cell: ({ getValue }) => <div className="max-w-[420px] truncate font-medium">{String(getValue())}</div> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={String(getValue())} variant="outline" /> },
  { accessorKey: "severity", header: "Severity", cell: ({ row }) => <AlertSeverityBadge severity={row.original.severity} /> },
  { accessorKey: "owner", header: "Owner" },
  { accessorKey: "alerts", header: "Alerts" },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ getValue }) => {
      const value = String(getValue() ?? "");
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return "—";
      return formatDistanceToNowStrict(date, { addSuffix: true });
    }
  }
];

export default function CasesPage() {
  const searchParams = useSearchParams();
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [severity, setSeverity] = React.useState<AlertSeverity>("medium");
  const [status, setStatus] = React.useState("open");
  const [isCreating, setIsCreating] = React.useState(false);
  const [linkAlertId, setLinkAlertId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const alertId = searchParams.get("alertId");
    if (alertId) {
      setLinkAlertId(alertId);
      setOpen(true);
      if (!title.trim()) setTitle("Investigation created from alert");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const sp = new URLSearchParams();
      sp.set("from", fromIso);
      sp.set("to", toIso);
      sp.set("limit", "200");
      const res = await fetch(`/api/cases?${sp.toString()}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load cases.");
      const cases = (payload?.data ?? []) as any[];

      const mapped: Row[] = (cases ?? []).map((c: any) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        severity: (c.severity as AlertSeverity) ?? "medium",
        owner: c.owner_user_id ? "Assigned" : "Unassigned",
        alerts: Number(c.alerts_count ?? 0),
        updatedAt: c.updated_at
      }));

      setRows(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load cases.");
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
    <div className="space-y-4">
      <PageHeader
        title="Cases"
        description="Investigation workflow, notes, evidence, outcomes."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New case
              </Button>
            </DialogTrigger>
            <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">New case</div>
                <div className="mt-1 text-xs text-muted-foreground">Create an investigation for the selected organization.</div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="case_title">
                    Title
                  </label>
                  <Input id="case_title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="International fraud investigation — NG route" />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Severity</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {severity}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {(["low", "medium", "high", "critical"] as AlertSeverity[]).map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setSeverity(s)}>
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Status</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {status}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {["open", "in_review", "closed"].map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <Button
                  disabled={isCreating || !activeOrg?.id || !title.trim()}
                  onClick={async () => {
                    if (!activeOrg?.id) return;
                    const trimmed = title.trim();
                    if (!trimmed) return;
                    setIsCreating(true);
                    try {
                      const res = await fetch("/api/cases/create", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ title: trimmed, status, severity, alertId: linkAlertId })
                      });
                      const payload = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(payload?.error ?? "Failed to create case.");
                      toast.success("Case created");
                      setOpen(false);
                      setTitle("");
                      await load();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to create case.");
                    } finally {
                      setIsCreating(false);
                    }
                  }}
                >
                  {isCreating ? "Creating…" : "Create case"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {error ? (
        <EmptyState title="Could not load cases" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter cases…"
          getRowHref={(r) => `/cases/${encodeURIComponent((r as any).id)}`}
          empty={{ title: "No cases yet", description: "Create a case from an alert to start investigations." }}
        />
      )}
    </div>
  );
}
