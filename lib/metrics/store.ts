import type { SupabaseClient } from "@supabase/supabase-js";

export async function upsertMetric(params: {
  supabaseAdmin: SupabaseClient;
  orgId: string;
  key: string;
  value: number;
  unit?: string;
  metadata?: Record<string, any>;
}) {
  const { supabaseAdmin, orgId, key, value, unit, metadata } = params;
  const { error } = await supabaseAdmin.from("system_metrics").upsert(
    {
      org_id: orgId,
      key,
      value,
      unit: unit ?? null,
      metadata: metadata ?? {},
      recorded_at: new Date().toISOString()
    },
    { onConflict: "org_id,key" }
  );
  if (error) throw error;
}

