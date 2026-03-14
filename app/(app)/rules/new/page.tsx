"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function safeJsonParse(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "Invalid JSON" };
  }
}

export default function NewRulePage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState("medium");
  const [status, setStatus] = React.useState("draft");
  const [windowMinutes, setWindowMinutes] = React.useState(15);
  const [dimensionType, setDimensionType] = React.useState("destination_country");
  const [dedupMinutes, setDedupMinutes] = React.useState(60);
  const [conditionsText, setConditionsText] = React.useState(
    JSON.stringify({ rule_type: "international_call_spike", threshold: 120, home_country: "US" }, null, 2)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="New rule"
        description="Create a fraud detection rule for the active organization."
        right={
          <Button
            className="gap-2"
            disabled={saving || !name.trim()}
            onClick={async () => {
              const parsed = safeJsonParse(conditionsText);
              if (!parsed.ok) {
                toast.error("Invalid conditions JSON", { description: parsed.error });
                return;
              }
              setSaving(true);
              try {
                const res = await fetch("/api/rules/create", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    name: name.trim(),
                    description,
                    severity,
                    status,
                    windowMinutes,
                    dimensionType,
                    conditions: parsed.value,
                    dedup_minutes: dedupMinutes
                  })
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(payload?.error ?? "Failed to create rule.");
                toast.success("Rule created");
                const id = payload?.id ? String(payload.id) : null;
                router.push(id ? `/rules/${encodeURIComponent(id)}` : "/rules");
              } catch (e: any) {
                toast.error(e?.message ?? "Failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            <Save className="h-4 w-4" />
            Create rule
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="name">
                Name
              </label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="High international call volume — NG gateway" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="desc">
                Description
              </label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this rule detect and why?" />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="sev">
                  Severity
                </label>
                <Input id="sev" value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="medium" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="st">
                  Status
                </label>
                <Input id="st" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="draft/enabled/disabled" />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="win">
                  Window minutes
                </label>
                <Input id="win" type="number" value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="dedup">
                  Dedup minutes
                </label>
                <Input id="dedup" type="number" value={dedupMinutes} onChange={(e) => setDedupMinutes(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="dim">
                Dimension type
              </label>
              <Input id="dim" value={dimensionType} onChange={(e) => setDimensionType(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Conditions (JSON)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={conditionsText}
              onChange={(e) => setConditionsText(e.target.value)}
              className="min-h-[520px] font-mono text-xs"
            />
            <div className="text-xs text-muted-foreground">
              Must include <code className="font-mono">rule_type</code> and <code className="font-mono">threshold</code>. Example:{" "}
              <code className="font-mono">
                {"{ rule_type: \"international_call_spike\", threshold: 120, home_country: \"US\" }"}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        <Link href="/rules" className="hover:text-foreground">
          Back to Rules
        </Link>
      </div>
    </div>
  );
}
