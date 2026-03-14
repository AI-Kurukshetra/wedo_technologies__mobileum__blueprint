"use client";

import { toast } from "sonner";
import { Plus, ToggleLeft, ToggleRight } from "lucide-react";
import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Row = { id: string; name: string; status: string; severity: AlertSeverity; window: string; dimension: string; updatedAt: string };

export default function RulesPage() {
  const { activeOrg } = useActiveOrg();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [severity, setSeverity] = React.useState<AlertSeverity>("medium");
  const [status, setStatus] = React.useState("enabled");
  const [windowMinutes, setWindowMinutes] = React.useState(15);
  const [dimensionType, setDimensionType] = React.useState("destination_country");
  const [isCreating, setIsCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/rules?limit=200");
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load rules.");
      const data = (payload?.data ?? []) as any[];

      const mapped: Row[] = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        severity: (r.severity as AlertSeverity) ?? "medium",
        window: `${r.window_minutes ?? 0}m`,
        dimension: r.dimension_type ?? "—",
        updatedAt: r.updated_at
      }));

      setRows(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load rules.");
    }
  }, [activeOrg?.id]);

  const columns = React.useMemo<Array<DataTableColumnDef<Row>>>(() => {
    return [
      {
        accessorKey: "name",
        header: "Rule",
        cell: ({ getValue }) => <div className="max-w-[420px] truncate font-medium">{String(getValue())}</div>
      },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge label={String(getValue())} variant="outline" /> },
      { accessorKey: "severity", header: "Severity", cell: ({ row }) => <AlertSeverityBadge severity={row.original.severity} /> },
      { accessorKey: "window", header: "Window" },
      { accessorKey: "dimension", header: "Dimension" },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ getValue }) => {
          const value = String(getValue() ?? "");
          const date = value ? new Date(value) : null;
          if (!date || Number.isNaN(date.getTime())) return "—";
          return formatDistanceToNowStrict(date, { addSuffix: true });
        }
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          const enabled = r.status === "enabled";
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={async (e) => {
                e.stopPropagation();
                const endpoint = enabled ? "disable" : "enable";
                const res = await fetch(`/api/rules/${encodeURIComponent(r.id)}/${endpoint}`, { method: "POST" });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast.error(payload?.error ?? "Failed");
                  return;
                }
                toast.success(enabled ? "Disabled" : "Enabled");
                await load();
              }}
            >
              {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              {enabled ? "Disable" : "Enable"}
            </Button>
          );
        }
      }
    ];
  }, [load]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    function onOrgChanged() {
      void load();
    }
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rules"
        description="Configure fraud detection logic and evaluation windows."
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/rules/new">Advanced builder</Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New rule
                </Button>
              </DialogTrigger>
              <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">New rule</div>
                <div className="mt-1 text-xs text-muted-foreground">Add a fraud detection rule for the selected organization.</div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="rule_name">
                    Name
                  </label>
                  <Input id="rule_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="High international call volume — NG gateway" />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Status</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {status}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {["draft", "enabled", "disabled"].map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="window_minutes">
                      Window (minutes)
                    </label>
                    <Input
                      id="window_minutes"
                      type="number"
                      value={windowMinutes}
                      min={1}
                      max={1440}
                      onChange={(e) => setWindowMinutes(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Dimension</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {dimensionType}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {["destination_country", "account_id", "carrier_id", "a_party"].map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setDimensionType(s)}>
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <Button
                  disabled={isCreating || !activeOrg?.id || !name.trim()}
                  onClick={async () => {
                    if (!activeOrg?.id) return;
                    const trimmed = name.trim();
                    if (!trimmed) return;
                    setIsCreating(true);
                    try {
                      const res = await fetch("/api/rules/create", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          name: trimmed,
                          description: "",
                          severity,
                          status,
                          windowMinutes,
                          dimensionType,
                          conditions: { thresholds: [] }
                        })
                      });
                      const payload = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(payload?.error ?? "Failed to create rule.");

                      toast.success("Rule created");
                      setOpen(false);
                      setName("");
                      await load();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to create rule.");
                    } finally {
                      setIsCreating(false);
                    }
                  }}
                >
                  {isCreating ? "Creating…" : "Create rule"}
                </Button>
              </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {error ? (
        <EmptyState title="Could not load rules" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter rules…"
          getRowHref={(r) => `/rules/${encodeURIComponent((r as any).id)}`}
          empty={{
            title: "No rules yet",
            description: "Create a rule to start generating alerts.",
            cta: { label: "Create rule", onClick: () => setOpen(true) }
          }}
        />
      )}
    </div>
  );
}
