"use client";

import * as React from "react";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { useMe } from "@/lib/me/useMe";

type Row = { userId: string; email: string | null; role: string; createdAt: string };

const roles = ["admin", "manager", "analyst", "read_only"] as const;

export default function AdminUsersPage() {
  const { activeOrg } = useActiveOrg();
  const { me } = useMe();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<(typeof roles)[number]>("analyst");
  const [inviting, setInviting] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      if (!activeOrg?.id) return setRows([]);
      const res = await fetch("/api/admin/users?limit=200");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load users.");
      setRows((body?.data ?? []) as Row[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users.");
    }
  }, [activeOrg?.id]);

  React.useEffect(() => void load(), [load]);

  React.useEffect(() => {
    function onOrgChanged() {
      void load();
    }
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged as any);
  }, [load]);

  const columns = React.useMemo<Array<DataTableColumnDef<Row>>>(() => {
    return [
      {
        accessorKey: "email",
        header: "User",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">{r.email ?? r.userId}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{r.userId}</div>
            </div>
          );
        }
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 justify-between">
                  {r.role}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {roles.map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/admin/users/${encodeURIComponent(r.userId)}`, {
                          method: "PATCH",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ role })
                        });
                        const body = (await res.json().catch(() => ({}))) as any;
                        if (!res.ok) throw new Error(body?.error ?? "Failed to update role.");
                        toast.success("Role updated");
                        await load();
                      } catch (e: any) {
                        toast.error("Update failed", { description: e?.message ?? "Unable to update role." });
                      }
                    }}
                  >
                    {role}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          const isMe = me?.user?.id === r.userId;
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              disabled={isMe}
              onClick={async (e) => {
                e.stopPropagation();
                if (!confirm("Remove this user from the org?")) return;
                try {
                  const res = await fetch(`/api/admin/users/${encodeURIComponent(r.userId)}`, { method: "DELETE" });
                  const body = (await res.json().catch(() => ({}))) as any;
                  if (!res.ok) throw new Error(body?.error ?? "Failed to remove user.");
                  toast.success("User removed");
                  await load();
                } catch (e2: any) {
                  toast.error("Remove failed", { description: e2?.message ?? "Unable to remove user." });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          );
        }
      }
    ];
  }, [load, me?.user?.id]);

  return (
    <div className="space-y-4">
      <PageHeader title="Users" description="Manage org members, roles, and invites." />

      <div className="rounded-lg border bg-card/30 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <div className="text-xs font-medium text-muted-foreground">Invite user</div>
            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst@acme.com" className="md:max-w-[320px]" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="justify-between md:w-[160px]">
                    {inviteRole}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {roles.map((r) => (
                    <DropdownMenuItem key={r} onClick={() => setInviteRole(r)}>
                      {r}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                className="gap-2"
                disabled={inviting || !activeOrg?.id || !email.trim()}
                onClick={async () => {
                  if (!activeOrg?.id) return;
                  setInviting(true);
                  try {
                    const res = await fetch("/api/invite", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ email: email.trim(), orgId: activeOrg.id, role: inviteRole })
                    });
                    const body = (await res.json().catch(() => ({}))) as any;
                    if (!res.ok) throw new Error(body?.error ?? "Invite failed.");
                    toast.success("Invite sent");
                    setEmail("");
                    await load();
                  } catch (e: any) {
                    toast.error("Invite failed", { description: e?.message ?? "Unable to invite user." });
                  } finally {
                    setInviting(false);
                  }
                }}
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Only admins can manage members. Invites send a Supabase email with a signup link.
          </div>
        </div>
      </div>

      {error ? (
        <EmptyState title="Could not load users" description={error} />
      ) : rows == null ? (
        <DataTableSkeleton rows={10} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Filter users…"
          empty={{ title: "No users", description: "Invite teammates to collaborate on alerts and cases." }}
        />
      )}
    </div>
  );
}

