import type { SupabaseClient } from "@supabase/supabase-js";

export async function listAllOrgIds(supabaseAdmin: SupabaseClient) {
  const { data, error } = await supabaseAdmin.from("orgs").select("id").order("created_at", { ascending: true }).limit(10000);
  if (error) throw error;
  return (data ?? []).map((r: any) => String(r.id)).filter(Boolean);
}

