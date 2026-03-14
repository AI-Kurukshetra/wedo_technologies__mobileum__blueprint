import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

const severityVariant: Record<AlertSeverity, "default" | "info" | "warning" | "danger"> = {
  low: "default",
  medium: "info",
  high: "warning",
  critical: "danger"
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const variant = severityVariant[severity];
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  const dot =
    severity === "critical"
      ? "bg-semantic-danger"
      : severity === "high"
        ? "bg-semantic-warning"
        : severity === "medium"
          ? "bg-semantic-info"
          : "bg-muted-foreground";

  return (
    <Badge variant={variant} className="gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </Badge>
  );
}
