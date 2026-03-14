import { cn } from "@/lib/utils";
import type { AlertSeverity } from "@/components/AlertSeverityBadge";

export function SeverityIndicator({ severity, className }: { severity: AlertSeverity; className?: string }) {
  const color =
    severity === "critical"
      ? "bg-semantic-danger"
      : severity === "high"
        ? "bg-semantic-warning"
        : severity === "medium"
          ? "bg-semantic-info"
          : "bg-muted-foreground";

  return <span className={cn("h-5 w-1 rounded-full", color, className)} aria-hidden />;
}

