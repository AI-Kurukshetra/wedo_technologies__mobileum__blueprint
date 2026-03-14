import type * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  right?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, right, className }: Props) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm leading-snug text-muted-foreground">{description}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}
