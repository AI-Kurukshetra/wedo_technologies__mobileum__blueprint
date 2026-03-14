"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";

type Row = {
  id: string;
  name: string;
  element_type: string;
  identifier: string;
  config: any;
};

export default function NetworkElementsPage() {
  const { activeOrg } = useActiveOrg();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [elementType, setElementType] = React.useState("gateway");
  const [identifier, setIdentifier] = React.useState("");
  const [configText, setConfigText] = React.useState("{}");

  const load = React.useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/network-elements");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load network elements.");
      setRows((body?.data ?? []) as Row[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load network elements.");
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

  const columns = React.useMemo<Array<DataTableColumnDef<Row>>>(() => {
    return [
      { accessorKey: "name", header: "Name", cell: ({ row }) => <div className="max-w-[360px] truncate font-medium">{row.original.name}</div> },
      { accessorKey: "element_type", header: "Type" },
      { accessorKey: "identifier", header: "Identifier" },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={async (e) => {
                e.stopPropagation();
                const res = await fetch(`/api/network-elements/${encodeURIComponent(r.id)}`, { method: "DELETE" });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) toast.error(body?.error ?? "Failed to delete");
                else toast.success("Network element deleted");
                await load();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          );
        }
      }
    ];
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Network elements"
        description="Track gateways, switches, and network element inventory."
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New element
              </Button>
            </DialogTrigger>
            <DialogContent>
              <div className="border-b px-6 py-4">
                <div className="text-sm font-semibold">Create network element</div>
              </div>
              <div className="space-y-3 px-6 py-4">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Core gateway 01" />
                <Input value={elementType} onChange={(e) => setElementType(e.target.value)} placeholder="gateway" />
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="gw-core-01" />
                <Textarea rows={5} value={configText} onChange={(e) => setConfigText(e.target.value)} />
                <Button
                  disabled={saving || !name.trim() || !elementType.trim() || !identifier.trim()}
                  onClick={async () => {
                    let config: any = {};
                    try {
                      config = configText.trim() ? JSON.parse(configText) : {};
                    } catch {
                      return toast.error("Invalid config JSON");
                    }

                    setSaving(true);
                    try {
                      const res = await fetch("/api/network-elements", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          name: name.trim(),
                          elementType: elementType.trim(),
                          identifier: identifier.trim(),
                          config
                        })
                      });
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(body?.error ?? "Failed to create network element.");
                      toast.success("Network element created");
                      setOpen(false);
                      setName("");
                      setElementType("gateway");
                      setIdentifier("");
                      setConfigText("{}");
                      await load();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to create network element.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Creating…" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {error ? (
        <EmptyState title="Could not load network elements" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={8} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter elements…"
          empty={{ title: "No network elements yet", description: "Create elements to prepare for network-level monitoring." }}
        />
      )}
    </div>
  );
}
