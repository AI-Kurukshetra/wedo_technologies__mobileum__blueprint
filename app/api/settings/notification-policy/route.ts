import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const recipients = Array.isArray(body?.emailRecipients) ? (body.emailRecipients as unknown[]) : [];
    const parsed = recipients.map((x) => String(x).trim()).filter(Boolean);
    const webhookUrlsRaw = Array.isArray(body?.webhookUrls) ? (body.webhookUrls as unknown[]) : [];
    const webhookUrls = webhookUrlsRaw.map((x) => String(x).trim()).filter(Boolean);

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { data: existing, error: eErr } = await supabase
      .from("notification_policies")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });

    const id = existing?.[0]?.id ?? null;
    const payload: any = { org_id: orgId, email_recipients: parsed, webhook_urls: webhookUrls };
    if (id) payload.id = id;

    const { data, error } = await supabase
      .from("notification_policies")
      .upsert(payload, { onConflict: "id" })
      .select("id,email_recipients,webhook_urls")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
