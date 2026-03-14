import { Badge } from "@/components/ui/badge";

type Variant = "default" | "info" | "success" | "warning" | "danger" | "outline";

export function StatusBadge({ label, variant = "default" }: { label: string; variant?: Variant }) {
  return <Badge variant={variant}>{label}</Badge>;
}

