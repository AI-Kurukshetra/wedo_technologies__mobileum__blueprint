"use client";

import { toast } from "sonner";
import { Mail, Users } from "lucide-react";
import * as React from "react";
import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg, ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function SettingsPage() {
  const { activeOrg } = useActiveOrg();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [memberCount, setMemberCount] = React.useState<number>(0);
  const [myRole, setMyRole] = React.useState<string | null>(null);
  const [policyId, setPolicyId] = React.useState<string | null>(null);
  const [recipients, setRecipients] = React.useState<string>("");
  const [webhooks, setWebhooks] = React.useState<string>("");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("analyst");
  const [inviting, setInviting] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/settings/summary");
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load settings.");

      const data = payload?.data ?? {};
      setOrgId(data.orgId ?? null);
      setMemberCount(Number(data.memberCount ?? 0));
      setMyRole(data.myRole ?? null);
      setPolicyId(data.policy?.id ?? null);
      setRecipients((data.policy?.email_recipients ?? []).join(", "));
      setWebhooks((data.policy?.webhook_urls ?? []).join(", "));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings.");
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Users, roles, and notification policies." />

      {error ? <EmptyState title="Could not load settings" description={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle>Users & roles</CardTitle>
                <CardDescription>Invite users and assign permissions.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={loading || !orgId || myRole !== "admin"}>
                  Invite user
                </Button>
              </DialogTrigger>
              <DialogContent>
                <div className="border-b px-6 py-4">
                  <div className="text-sm font-semibold">Invite user</div>
                  <div className="mt-1 text-xs text-muted-foreground">Sends an email invite and adds the user to this organization.</div>
                </div>
                <div className="space-y-3 px-6 py-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="invite_email">
                      Email
                    </label>
                    <Input
                      id="invite_email"
                      placeholder="analyst@acme.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={inviting}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Role</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between" disabled={inviting}>
                          {inviteRole}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {["analyst", "manager", "read_only", "admin"].map((r) => (
                          <DropdownMenuItem key={r} onClick={() => setInviteRole(r)}>
                            {r}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="text-xs text-muted-foreground">Only org admins can invite users.</div>
                  </div>

                  <Button
                    disabled={inviting || !orgId || myRole !== "admin" || !inviteEmail.trim()}
                    onClick={async () => {
                      if (!orgId) return;
                      setInviting(true);
                      try {
                        const res = await fetch("/api/invite", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ email: inviteEmail.trim(), orgId, role: inviteRole })
                        });
                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          throw new Error(payload?.error ?? "Invite failed");
                        }
                        toast.success("Invite sent", { description: inviteEmail.trim() });
                        setInviteOpen(false);
                        setInviteEmail("");
                        setInviteRole("analyst");
                        await load();
                      } catch (e: any) {
                        toast.error("Invite failed", { description: e?.message ?? "Unable to invite user." });
                      } finally {
                        setInviting(false);
                      }
                    }}
                  >
                    {inviting ? "Sending…" : "Send invite"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            {loading ? (
              <Skeleton className="h-4 w-44" />
            ) : orgId ? (
              <div className="text-xs text-muted-foreground">
                {memberCount} members in this org{myRole ? ` • Your role: ${myRole}` : ""}.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No organization selected.</div>
            )}
            <Button variant="ghost" asChild className="w-fit px-0 text-xs">
              <Link href="/settings/billing-connectors">Manage billing connectors</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Webhook routing (and email recipients) for escalations.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="recipients">
                Email recipients
              </label>
              <Input
                id="recipients"
                placeholder="fraud@acme.com, noc@acme.com"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                disabled={loading || !orgId}
              />
              <div className="text-xs text-muted-foreground">Email delivery is not wired to a provider yet; use webhooks for production notifications.</div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="webhooks">
                Webhook URLs
              </label>
              <Input
                id="webhooks"
                placeholder="https://hooks.example.com/teleguard, https://..."
                value={webhooks}
                onChange={(e) => setWebhooks(e.target.value)}
                disabled={loading || !orgId}
              />
              <div className="text-xs text-muted-foreground">
                Each URL receives a POST payload: {"{ type: \"alert.escalated\", alert: { ... } }"}.
              </div>
            </div>
            <Button
              disabled={loading || !orgId}
              onClick={async () => {
                if (!orgId) return;
                const parsed = recipients
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const webhookUrls = webhooks
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const res = await fetch("/api/settings/notification-policy", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ emailRecipients: parsed, webhookUrls })
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast.error(payload?.error ?? "Failed to save policy");
                  return;
                }

                setPolicyId(payload?.data?.id ?? policyId);
                toast.success("Policy saved");
              }}
            >
              Save policy
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
