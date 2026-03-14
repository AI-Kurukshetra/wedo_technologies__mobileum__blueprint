import type { SupabaseClient } from "@supabase/supabase-js";

export async function createNextRuleVersion(params: {
  supabase: SupabaseClient;
  orgId: string;
  ruleId: string;
  snapshot: Record<string, any>;
  createdByUserId: string | null;
}) {
  const { supabase, orgId, ruleId, snapshot, createdByUserId } = params;

  const { data: versions, error: vErr } = await supabase
    .from("fraud_rule_versions")
    .select("version")
    .eq("org_id", orgId)
    .eq("rule_id", ruleId)
    .order("version", { ascending: false })
    .limit(1);
  if (vErr) throw vErr;

  const latest = versions?.[0]?.version ?? 0;
  const next = Number(latest) + 1;

  const { data, error } = await supabase
    .from("fraud_rule_versions")
    .insert({
      org_id: orgId,
      rule_id: ruleId,
      version: next,
      snapshot,
      created_by_user_id: createdByUserId
    })
    .select("id,version")
    .single();
  if (error) throw error;

  return { id: data.id as string, version: data.version as number };
}

