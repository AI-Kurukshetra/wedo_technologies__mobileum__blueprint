import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/api/active-org";

type Result = { type: string; id: string; title: string; subtitle?: string; href: string };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ results: [] satisfies Result[] });

    const supabase = await createSupabaseServerClient();
    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgIdForUser(supabase as any, user.id);
    if (!orgId) return NextResponse.json({ results: [] satisfies Result[] });

    const limit = 5;
    const pattern = `%${q.replaceAll("%", "").replaceAll("_", "")}%`;
    const results: Result[] = [];

    // Alerts
    {
      const query = supabase
        .from("alerts")
        .select("id,title,severity,status,created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      const { data } = isUuid(q) ? await query.eq("id", q) : await query.ilike("title", pattern);
      for (const a of data ?? []) {
        results.push({
          type: "alert",
          id: String((a as any).id),
          title: String((a as any).title ?? "Alert"),
          subtitle: `${String((a as any).severity ?? "")} • ${String((a as any).status ?? "")}`,
          href: `/alerts/${encodeURIComponent(String((a as any).id))}`
        });
      }
    }

    // Cases
    {
      const query = supabase
        .from("cases")
        .select("id,title,status,severity,updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      const { data } = isUuid(q) ? await query.eq("id", q) : await query.ilike("title", pattern);
      for (const c of data ?? []) {
        results.push({
          type: "case",
          id: String((c as any).id),
          title: String((c as any).title ?? "Case"),
          subtitle: `${String((c as any).severity ?? "")} • ${String((c as any).status ?? "")}`,
          href: `/cases/${encodeURIComponent(String((c as any).id))}`
        });
      }
    }

    // Rules
    {
      const query = supabase
        .from("fraud_rules")
        .select("id,name,status,severity,updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      const { data } = isUuid(q) ? await query.eq("id", q) : await query.ilike("name", pattern);
      for (const r of data ?? []) {
        results.push({
          type: "rule",
          id: String((r as any).id),
          title: String((r as any).name ?? "Rule"),
          subtitle: `${String((r as any).severity ?? "")} • ${String((r as any).status ?? "")}`,
          href: `/rules/${encodeURIComponent(String((r as any).id))}`
        });
      }
    }

    // Subscribers
    {
      const cleaned = q.replaceAll(/\s+/g, "");
      const query = supabase
        .from("subscribers")
        .select("id,msisdn,status")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      const { data } = isUuid(q) ? await query.eq("id", q) : await query.ilike("msisdn", `%${cleaned}%`);
      for (const s of data ?? []) {
        results.push({
          type: "subscriber",
          id: String((s as any).id),
          title: String((s as any).msisdn ?? "Subscriber"),
          subtitle: String((s as any).status ?? ""),
          href: `/subscribers/${encodeURIComponent(String((s as any).id))}`
        });
      }
    }

    // Partners
    {
      const query = supabase
        .from("partners")
        .select("id,name,partner_type,country_code")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      const { data } = isUuid(q) ? await query.eq("id", q) : await query.ilike("name", pattern);
      for (const p of data ?? []) {
        const cc = (p as any).country_code ? String((p as any).country_code) : "";
        results.push({
          type: "partner",
          id: String((p as any).id),
          title: String((p as any).name ?? "Partner"),
          subtitle: `${String((p as any).partner_type ?? "")}${cc ? ` • ${cc}` : ""}`,
          href: `/partners/${encodeURIComponent(String((p as any).id))}`
        });
      }
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

