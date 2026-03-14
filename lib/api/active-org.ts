import type { SupabaseClient } from "@supabase/supabase-js";

export async function getActiveOrgIdForUser(supabase: SupabaseClient, userId: string) {
  const { data: active, error: aErr } = await supabase
    .from("active_orgs")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (active?.org_id) return String(active.org_id);

  const { data: first, error: fErr } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fErr) throw fErr;
  return first?.org_id ? String(first.org_id) : null;
}

