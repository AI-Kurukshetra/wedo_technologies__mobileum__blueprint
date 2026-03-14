"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { formatISO } from "date-fns";
import { Play, Save, ToggleLeft, ToggleRight } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { AlertSeverityBadge, type AlertSeverity } from "@/components/AlertSeverityBadge";
import { DataTable, type DataTableColumnDef } from "@/components/tables/data-table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

type Rule = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  severity: AlertSeverity;
  window_minutes: number;
  dimension_type: string;
  dedup_minutes: number;
  conditions: any;
  created_at: string;
  updated_at: string;
};

type MatchRow = { dimensionValue: string; why: string; stats: any };

const matchColumns: Array<DataTableColumnDef<MatchRow>> = [
  { accessorKey: "dimensionValue", header: "Dimension", cell: ({ getValue }) => <div className="font-medium">{String(getValue() ?? "—")}</div> },
  { accessorKey: "why", header: "Why", cell: ({ getValue }) => <div className="max-w-[520px] truncate">{String(getValue() ?? "—")}</div> },
  { accessorKey: "stats", header: "Stats", cell: ({ getValue }) => <div className="max-w-[320px] truncate text-xs text-muted-foreground">{JSON.stringify(getValue() ?? {})}</div> }
];

function safeJsonParse(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "Invalid JSON" };
  }
}

export default function RuleDetailPage() {
  const params = useParams<{ ruleId: string }>();
  const ruleId = params.ruleId;

  const [rule, setRule] = React.useState<Rule | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState<AlertSeverity>("medium");
  const [status, setStatus] = React.useState("draft");
  const [windowMinutes, setWindowMinutes] = React.useState(15);
  const [dimensionType, setDimensionType] = React.useState("destination_country");
  const [dedupMinutes, setDedupMinutes] = React.useState(60);
  const [conditionsText, setConditionsText] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    setRule(null);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(ruleId)}`);
      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load rule.");
      const r = payload?.data as Rule;
      setRule(r);
      setName(r.name ?? "");
      setDescription(r.description ?? "");
      setSeverity(r.severity ?? "medium");
      setStatus(r.status ?? "draft");
      setWindowMinutes(Number(r.window_minutes ?? 15));
      setDimensionType(r.dimension_type ?? "destination_country");
      setDedupMinutes(Number(r.dedup_minutes ?? 60));
      setConditionsText(JSON.stringify(r.conditions ?? {}, null, 2));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load rule.");
    }
  }, [ruleId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState title="Could not load rule" description={error} />;
  if (!rule) {
    return (
      <div className="space-y-4">
        <PageHeader title="Rule" description="Loading rule…" />
        <Skeleton className="h-[160px] rounded-lg border" />
        <Skeleton className="h-[380px] rounded-lg border" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={rule.name}
        description="Edit rule configuration, test logic, and toggle status."
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                const endpoint = status === "enabled" ? "disable" : "enable";
                const res = await fetch(`/api/rules/${encodeURIComponent(ruleId)}/${endpoint}`, { method: "POST" });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast.error(payload?.error ?? "Failed");
                  return;
                }
                toast.success(endpoint === "enable" ? "Enabled" : "Disabled");
                await load();
              }}
            >
              {status === "enabled" ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              {status === "enabled" ? "Disable" : "Enable"}
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Play className="h-4 w-4" />
                  Test rule
                </Button>
              </DialogTrigger>
              <TestRuleDialog ruleId={ruleId} />
            </Dialog>
            <Button
              className="gap-2"
              disabled={saving}
              onClick={async () => {
                const parsed = safeJsonParse(conditionsText);
                if (!parsed.ok) {
                  toast.error("Invalid conditions JSON", { description: parsed.error });
                  return;
                }
                setSaving(true);
                try {
                  const res = await fetch(`/api/rules/${encodeURIComponent(ruleId)}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      name,
                      description,
                      severity,
                      status,
                      window_minutes: windowMinutes,
                      dimension_type: dimensionType,
                      conditions: parsed.value,
                      dedup_minutes: dedupMinutes
                    })
                  });
                  const payload = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(payload?.error ?? "Failed to save rule.");
                  toast.success("Saved");
                  await load();
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <StatusBadge label={status} variant="outline" />
            <AlertSeverityBadge severity={severity} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Window</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{windowMinutes} minutes</div>
            <div className="mt-1 text-xs text-muted-foreground">Dedup: {dedupMinutes}m</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Dimension</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{dimensionType}</div>
            <div className="mt-1 text-xs text-muted-foreground">Updated {new Date(rule.updated_at).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="rule_name">
                Name
              </label>
              <Input id="rule_name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="rule_desc">
                Description
              </label>
              <Textarea id="rule_desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="sev">
                  Severity
                </label>
                <Input id="sev" value={severity} onChange={(e) => setSeverity(e.target.value as any)} placeholder="medium" />
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
              placeholder={`{\n  "rule_type": "international_call_spike",\n  "threshold": 120,\n  "home_country": "US"\n}`}
            />
            <div className="text-xs text-muted-foreground">
              Supported `rule_type`: volume_spike, international_call_spike, premium_number_calls, roaming_activity, duplicate_cdr_detection, high_cost_destination.
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

function TestRuleDialog({ ruleId }: { ruleId: string }) {
  const [from, setFrom] = React.useState(() => formatISO(new Date(Date.now() - 60 * 60 * 1000)));
  const [to, setTo] = React.useState(() => formatISO(new Date()));
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<MatchRow[] | null>(null);

  return (
    <DialogContent>
      <div className="border-b px-6 py-4">
        <div className="text-sm font-semibold">Test rule</div>
        <div className="mt-1 text-xs text-muted-foreground">Runs rule logic over a time range without creating alerts.</div>
      </div>
      <div className="space-y-3 px-6 py-4">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="from">
              From (ISO)
            </label>
            <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="to">
              To (ISO)
            </label>
            <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setRows(null);
            try {
              const res = await fetch(`/api/rules/${encodeURIComponent(ruleId)}/test`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ from, to, limit: 20000 })
              });
              const payload = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(payload?.error ?? "Test failed");
              const matches = (payload?.data?.matches ?? []) as any[];
              setRows(matches.map((m) => ({ dimensionValue: String(m.dimensionValue ?? "—"), why: String(m.why ?? "—"), stats: m.stats ?? {} })));
            } catch (e: any) {
              toast.error(e?.message ?? "Test failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Play className="h-4 w-4" />
          {loading ? "Running…" : "Run test"}
        </Button>

        {rows ? (
          <DataTable
            columns={matchColumns}
            data={rows}
            initialPageSize={5}
            searchPlaceholder="Filter matches…"
            empty={{ title: "No matches", description: "This rule did not exceed its threshold in the selected window." }}
          />
        ) : null}
      </div>
    </DialogContent>
  );
}

