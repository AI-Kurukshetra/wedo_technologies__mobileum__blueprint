"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { PlugZap, TestTube2, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";

type ConnectorRow = {
  id: string;
  name: string;
  connector_type: string;
  enabled: boolean;
  config: any;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  updated_at: string;
};

export default function BillingConnectorsPage() {
  const { activeOrg } = useActiveOrg();
  const [rows, setRows] = React.useState<ConnectorRow[] | null>(null);
  const [definitions, setDefinitions] = React.useState<Array<{ type: string; title: string; description: string; defaults: any }>>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [connectorType, setConnectorType] = React.useState("mock_rest");
  const [configText, setConfigText] = React.useState("{}");

  const load = React.useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/billing-connectors");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load connectors.");
      setRows((body?.data ?? []) as ConnectorRow[]);
      setDefinitions(Array.isArray(body?.definitions) ? body.definitions : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load connectors.");
    }
  }, [activeOrg?.id]);

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

  const columns = React.useMemo<Array<DataTableColumnDef<ConnectorRow>>>(() => {
    return [
      { accessorKey: "name", header: "Connector", cell: ({ row }) => <div className="max-w-[380px] truncate font-medium">{row.original.name}</div> },
      { accessorKey: "connector_type", header: "Type" },
      { accessorKey: "enabled", header: "Enabled", cell: ({ row }) => (row.original.enabled ? "Yes" : "No") },
      {
        accessorKey: "last_tested_at",
        header: "Last test",
        cell: ({ row }) => {
          const v = row.original.last_tested_at;
          if (!v) return "—";
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) return "—";
          return formatDistanceToNowStrict(d, { addSuffix: true });
        }
      },
      { accessorKey: "last_test_status", header: "Status", cell: ({ row }) => row.original.last_test_status ?? "—" },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={async (e) => {
                  e.stopPropagation();
                  const res = await fetch(`/api/billing-connectors/${encodeURIComponent(r.id)}/test`, { method: "POST" });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    toast.error(body?.error ?? "Connector test failed");
                  } else {
                    toast.success(`Connector test passed (${body?.data?.count ?? 0} records)`);
                  }
                  await load();
                }}
              >
                <TestTube2 className="h-4 w-4" />
                Test
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={async (e) => {
                  e.stopPropagation();
                  const res = await fetch(`/api/billing-connectors/${encodeURIComponent(r.id)}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ enabled: !r.enabled })
                  });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) toast.error(body?.error ?? "Failed to update connector");
                  else toast.success(r.enabled ? "Connector disabled" : "Connector enabled");
                  await load();
                }}
              >
                {r.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={async (e) => {
                  e.stopPropagation();
                  const res = await fetch(`/api/billing-connectors/${encodeURIComponent(r.id)}`, { method: "DELETE" });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) toast.error(body?.error ?? "Failed to delete connector");
                  else toast.success("Connector deleted");
                  await load();
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
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
        title="Billing connectors"
        description="Configure abstraction connectors for billing and mediation systems."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <PlugZap className="h-4 w-4" />
                New connector
              </Button>
            </DialogTrigger>
            <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">Create billing connector</div>
                <div className="mt-1 text-xs text-muted-foreground">Use mock connectors for integration and reconciliation demos.</div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing mock connector" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <Input value={connectorType} onChange={(e) => setConnectorType(e.target.value)} placeholder="mock_rest or mock_csv" />
                  <div className="text-xs text-muted-foreground">
                    {definitions.map((d) => d.type).join(", ")}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Config JSON</label>
                  <Textarea rows={6} value={configText} onChange={(e) => setConfigText(e.target.value)} />
                </div>
                <Button
                  disabled={saving || !name.trim() || !connectorType.trim()}
                  onClick={async () => {
                    let configObj: any = {};
                    try {
                      configObj = configText.trim() ? JSON.parse(configText) : {};
                    } catch {
                      return toast.error("Invalid JSON config");
                    }
                    setSaving(true);
                    try {
                      const res = await fetch("/api/billing-connectors", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          name: name.trim(),
                          connectorType: connectorType.trim(),
                          config: configObj,
                          enabled: true
                        })
                      });
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(body?.error ?? "Failed to create connector.");
                      toast.success("Connector created");
                      setOpen(false);
                      setName("");
                      setConnectorType("mock_rest");
                      setConfigText("{}");
                      await load();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to create connector.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Creating…" : "Create connector"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {error ? (
        <EmptyState title="Could not load connectors" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={8} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter connectors…"
          empty={{ title: "No connectors yet", description: "Create a connector to test billing/mediation integration flows." }}
        />
      )}
    </div>
  );
}
