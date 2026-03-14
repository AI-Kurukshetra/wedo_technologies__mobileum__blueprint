"use client";

import * as React from "react";
import { toast } from "sonner";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { OrgOption } from "@/lib/active-org/types";

type ActiveOrgState = {
  orgs: OrgOption[];
  activeOrg: OrgOption | null;
  isLoading: boolean;
  error: string | null;
  setActiveOrgId: (orgId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ActiveOrgContext = React.createContext<ActiveOrgState | null>(null);

export const ACTIVE_ORG_CHANGED_EVENT = "teleguard:active-org-changed";

export function useActiveOrg() {
  const ctx = React.useContext(ActiveOrgContext);
  if (!ctx) throw new Error("useActiveOrg must be used within <ActiveOrgProvider />");
  return ctx;
}

async function fetchOrgs() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("org_memberships")
    .select("org_id,orgs(name,slug)")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const seen = new Set<string>();
  const orgs: OrgOption[] = (data ?? [])
    .map((row: any) => ({
      id: row.org_id as string,
      name: row.orgs?.name ? String(row.orgs.name) : "Organization",
      slug: row.orgs?.slug ? String(row.orgs.slug) : "—"
    }))
    .filter((o) => Boolean(o.id) && !seen.has(o.id) && seen.add(o.id));

  return orgs;
}

async function fetchActiveOrgId() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.from("active_orgs").select("org_id").maybeSingle();
  if (error) throw error;
  return (data as any)?.org_id as string | undefined;
}

async function upsertActiveOrg(orgId: string) {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { user },
    error: uErr
  } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("active_orgs").upsert({ user_id: user.id, org_id: orgId });
  if (error) throw error;
}

export function ActiveOrgProvider({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = React.useState<OrgOption[]>([]);
  const [activeOrg, setActiveOrg] = React.useState<OrgOption | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [orgOptions, activeId] = await Promise.all([fetchOrgs(), fetchActiveOrgId().catch(() => undefined)]);
      setOrgs(orgOptions);

      const defaultOrg = orgOptions[0] ?? null;
      const selected = (activeId && orgOptions.find((o) => o.id === activeId)) || defaultOrg;

      if (selected && (!activeId || activeId !== selected.id)) {
        await upsertActiveOrg(selected.id);
      }

      setActiveOrg(selected ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organizations.");
      setActiveOrg(null);
      setOrgs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setActiveOrgId = React.useCallback(
    async (orgId: string) => {
      const next = orgs.find((o) => o.id === orgId);
      if (!next) return;

      try {
        await upsertActiveOrg(orgId);
        setActiveOrg(next);
        toast.success(`Switched to ${next.name}`);
        window.dispatchEvent(new CustomEvent(ACTIVE_ORG_CHANGED_EVENT, { detail: { orgId } }));
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to switch org.");
      }
    },
    [orgs]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: ActiveOrgState = React.useMemo(
    () => ({ orgs, activeOrg, isLoading, error, setActiveOrgId, refresh }),
    [orgs, activeOrg, isLoading, error, setActiveOrgId, refresh]
  );

  return <ActiveOrgContext.Provider value={value}>{children}</ActiveOrgContext.Provider>;
}
