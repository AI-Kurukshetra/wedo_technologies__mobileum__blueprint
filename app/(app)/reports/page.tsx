"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useDateRange, DATE_RANGE_CHANGED_EVENT } from "@/lib/date-range/context";
import { Input } from "@/components/ui/input";

type ReportRow = {
  id: string;
  name: string;
  report_type: string;
  created_at: string;
  schedule_cron: string | null;
  recipients: string[] | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  last_output_path: string | null;
  metadata: any;
  config: any;
};

const typeLabels: Record<string, string> = {
  revenue_assurance: "Revenue Assurance",
  fraud_detection: "Fraud Detection",
  roaming_activity: "Roaming Activity",
  interconnect_revenue: "Interconnect Revenue",
  regulatory_summary: "Regulatory Summary",
  compliance_audit: "Compliance Audit Trail",
  revenue_recovery: "Revenue Recovery"
};

export default function ReportsPage() {
  const { activeOrg } = useActiveOrg();
  const { fromIso, toIso } = useDateRange();
  const [rows, setRows] = React.useState<ReportRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<string>("revenue_assurance");
  const [generating, setGenerating] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/reports?limit=200");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load reports.");
      setRows((body?.data ?? []) as ReportRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load reports.");
    }
  }, [activeOrg?.id]);

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

  const columns = React.useMemo<Array<DataTableColumnDef<ReportRow>>>(() => {
    return [
      {
        accessorKey: "name",
        header: "Report",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{typeLabels[r.report_type] ?? r.report_type}</div>
            </div>
          );
        }
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ getValue }) => {
          const value = String(getValue() ?? "");
          const d = value ? new Date(value) : null;
          if (!d || Number.isNaN(d.getTime())) return "—";
          return formatDistanceToNowStrict(d, { addSuffix: true });
        }
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = String(row.original.last_run_status ?? row.original.metadata?.status ?? "—");
          return <span className="text-sm text-muted-foreground">{status}</span>;
        }
      },
      {
        id: "schedule",
        header: "Schedule",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.schedule_cron || "Manual"}</span>
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          const meta = r.metadata ?? {};
          const ready = meta.status === "ready" && meta.path;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={async (e) => {
                  e.stopPropagation();
                  const cron = window.prompt("Cron schedule (leave empty to disable):", r.schedule_cron ?? "") ?? "";
                  if (cron === (r.schedule_cron ?? "")) return;
                  const recipientsRaw =
                    window.prompt("Recipients (comma separated emails):", Array.isArray(r.recipients) ? r.recipients.join(", ") : "") ?? "";
                  const recipients = recipientsRaw
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);
                  const res = await fetch(`/api/reports/${encodeURIComponent(r.id)}/schedule`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ scheduleCron: cron.trim(), recipients })
                  });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) toast.error(body?.error ?? "Failed to save schedule");
                  else {
                    toast.success("Schedule updated");
                    await load();
                  }
                }}
              >
                Schedule
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                disabled={!ready}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await fetch(`/api/reports/${encodeURIComponent(r.id)}/download`);
                    const body = (await res.json().catch(() => ({}))) as any;
                    if (!res.ok) throw new Error(body?.error ?? "Download failed");
                    const url = String(body?.url ?? "");
                    if (!url) throw new Error("No signed URL");
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch (err: any) {
                    toast.error("Download failed", { description: err?.message ?? "Unable to download report." });
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          );
        }
      }
    ];
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description="Generate CSV reports, including regulatory and compliance exports."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!activeOrg?.id}>
                <Plus className="h-4 w-4" />
                Generate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">Generate report</div>
                <div className="mt-1 text-xs text-muted-foreground">Uses the current date range from the top bar.</div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="report_name">
                    Name (optional)
                  </label>
                  <Input id="report_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly fraud detection summary" />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Type</div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {typeLabels[type] ?? type}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {Object.keys(typeLabels).map((t) => (
                        <DropdownMenuItem key={t} onClick={() => setType(t)}>
                          {typeLabels[t]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Button
                  disabled={generating || !activeOrg?.id}
                  onClick={async () => {
                    setGenerating(true);
                    try {
                      const res = await fetch("/api/reports/generate", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ type, from: fromIso, to: toIso, name: name.trim() || undefined })
                      });
                      const body = (await res.json().catch(() => ({}))) as any;
                      if (!res.ok) throw new Error(body?.error ?? "Failed to generate report.");
                      toast.success("Report generated");
                      setOpen(false);
                      setName("");
                      await load();
                    } catch (e: any) {
                      toast.error("Report failed", { description: e?.message ?? "Unable to generate report." });
                    } finally {
                      setGenerating(false);
                    }
                  }}
                >
                  {generating ? "Generating…" : "Generate CSV"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {error ? (
        <EmptyState title="Could not load reports" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter reports…"
          empty={{ title: "No reports yet", description: "Generate a report to create a downloadable CSV." }}
        />
      )}
    </div>
  );
}

