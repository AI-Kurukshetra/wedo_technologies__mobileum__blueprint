"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  compact?: boolean;
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
};

export function DateRangePicker({ compact, value, onChange }: Props) {
  const [range, setRange] = React.useState<DateRange | undefined>(
    value ?? { from: addDays(new Date(), -7), to: new Date() }
  );

  React.useEffect(() => {
    if (value) setRange(value);
  }, [value]);

  const label = range?.from
    ? range.to
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`
      : format(range.from, "MMM d")
    : "Pick a range";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-start gap-2 text-sm", compact ? "w-full" : "w-[220px]")}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className={cn("truncate", !range?.from && "text-muted-foreground")}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={range?.from}
          selected={range}
          onSelect={(next) => {
            setRange(next);
            onChange?.(next);
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}

