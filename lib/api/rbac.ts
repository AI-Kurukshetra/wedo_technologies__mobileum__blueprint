import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgRole = "admin" | "manager" | "analyst" | "read_only" | string;

export async function getOrgRoleForUser(params: { supabase: SupabaseClient; orgId: string; userId: string }) {
  const { data, error } = await params.supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role ?? null) as OrgRole | null;
}

export function canWrite(role: OrgRole | null) {
  return role === "admin" || role === "manager" || role === "analyst";
}

export function requireWriteRole(role: OrgRole | null) {
  if (!canWrite(role)) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
}

