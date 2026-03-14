import type * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  cta?: { label: string; href?: string; onClick?: () => void };
  secondaryCta?: { label: string; href?: string; onClick?: () => void };
  className?: string;
};

export function EmptyState({ title, description, icon, cta, secondaryCta, className }: Props) {
  const CtaContent = (
    <Button onClick={cta?.onClick} variant="default" className="mt-3">
      {cta?.label}
    </Button>
  );
  const SecondaryContent = (
    <Button onClick={secondaryCta?.onClick} variant="outline" className="mt-3">
      {secondaryCta?.label}
    </Button>
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-10 text-center shadow-elev-1",
        className
      )}
    >
      {icon ? <div className="mb-4 grid h-10 w-10 place-items-center rounded-md border bg-muted/40">{icon}</div> : null}
      <div className="text-sm font-semibold">{title}</div>
      {description ? <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div> : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {cta?.href ? <Link href={cta.href}>{CtaContent}</Link> : cta ? CtaContent : null}
        {secondaryCta?.href ? <Link href={secondaryCta.href}>{SecondaryContent}</Link> : secondaryCta ? SecondaryContent : null}
      </div>
    </div>
  );
}
