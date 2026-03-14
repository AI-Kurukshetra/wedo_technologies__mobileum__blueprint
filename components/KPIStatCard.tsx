import type * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" };
  icon?: React.ReactNode;
  className?: string;
};

export function KPIStatCard({ label, value, delta, icon, className }: Props) {
  const DeltaIcon = delta?.direction === "down" ? ArrowDownRight : ArrowUpRight;
  const deltaColor = delta?.direction === "down" ? "text-semantic-danger" : "text-semantic-success";
  const deltaPill =
    delta?.direction === "down"
      ? "border-semantic-danger/25 bg-semantic-danger/10 text-semantic-danger"
      : "border-semantic-success/25 bg-semantic-success/10 text-semantic-success";

  return (
    <Card className={cn("group relative overflow-hidden", className)}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </CardTitle>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold leading-tight tracking-tight sm:text-xl tabular-nums" title={value}>
            {value}
          </div>
        </div>
        {icon ? (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-muted/30 text-muted-foreground transition-colors group-hover:bg-muted/40">
            {icon}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {delta ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("gap-1.5 border text-[11px]", deltaPill)}>
              <DeltaIcon className={cn("h-3.5 w-3.5", deltaColor)} />
              <span>{delta.value}</span>
            </Badge>
            <span className="text-xs text-muted-foreground">vs previous</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Selected range</div>
        )}
      </CardContent>
      <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-muted/40 blur-2xl transition-opacity group-hover:opacity-80" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-muted/30 blur-3xl" />
    </Card>
  );
}
