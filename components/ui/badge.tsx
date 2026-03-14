import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-tight transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        outline: "bg-transparent text-foreground",
        success: "border-transparent bg-semantic-success/15 text-semantic-success",
        warning: "border-transparent bg-semantic-warning/15 text-semantic-warning",
        danger: "border-transparent bg-semantic-danger/15 text-semantic-danger",
        info: "border-transparent bg-semantic-info/15 text-semantic-info"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
