"use client";

import * as React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type FilterChip = { key: string; label: string; value: string };

type Props = {
  placeholder?: string;
  value?: string;
  onChange?: (next: string) => void;
  chips?: FilterChip[];
  onRemoveChip?: (key: string) => void;
  className?: string;
};

export function FilterBar({ placeholder = "Filter…", value, onChange, chips, onRemoveChip, className }: Props) {
  const [local, setLocal] = React.useState(value ?? "");

  React.useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 shadow-elev-1 transition-shadow duration-200 md:flex-row md:items-center",
        "hover:shadow-elev-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden md:inline">Filters</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={local}
            onChange={(e) => {
              const next = e.target.value;
              setLocal(next);
              onChange?.(next);
            }}
            placeholder={placeholder}
            className="h-9 pl-9 pr-9"
          />
          {local ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => {
                setLocal("");
                onChange?.("");
              }}
              aria-label="Clear filter"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {chips?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="outline" className="gap-1.5 bg-background/40">
              <span className="text-muted-foreground">{chip.label}:</span>
              <span>{chip.value}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => onRemoveChip?.(chip.key)}
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
