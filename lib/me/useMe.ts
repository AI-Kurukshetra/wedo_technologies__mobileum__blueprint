"use client";

import * as React from "react";

import { ACTIVE_ORG_CHANGED_EVENT } from "@/lib/active-org/context";

export type MePayload = {
  user: { id: string; email: string | null };
  org: { id: string; name: string; slug: string };
  membership: { role: string };
};

export function useMe() {
  const [me, setMe] = React.useState<MePayload | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/me");
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error ?? "Failed to load session.");
      setMe(body as MePayload);
    } catch {
      setMe(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  return { me, isLoading, refresh: load };
}

