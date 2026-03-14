"use client";

import * as React from "react";
import { addDays, endOfDay, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

export const DATE_RANGE_CHANGED_EVENT = "tgpro:date-range-changed";

type DateRangeState = {
  range: DateRange;
  setRange: (next: DateRange | undefined) => void;
  fromIso: string;
  toIso: string;
};

const STORAGE_KEY = "tgpro_date_range_v1";

function defaultRange(): DateRange {
  return { from: addDays(new Date(), -7), to: new Date() };
}

function toPersisted(range: DateRange) {
  return {
    from: range.from ? range.from.toISOString() : null,
    to: range.to ? range.to.toISOString() : null
  };
}

function fromPersisted(raw: any): DateRange {
  const from = raw?.from ? new Date(raw.from) : null;
  const to = raw?.to ? new Date(raw.to) : null;
  const safeFrom = from && !Number.isNaN(from.getTime()) ? from : null;
  const safeTo = to && !Number.isNaN(to.getTime()) ? to : null;
  const fallback = defaultRange();
  return {
    from: safeFrom ?? fallback.from,
    to: safeTo ?? fallback.to
  };
}

function bounds(range: DateRange) {
  const fallback = defaultRange();
  const from = range.from ?? fallback.from!;
  const to = range.to ?? range.from ?? fallback.to!;
  const fromTs = startOfDay(from).toISOString();
  const toTs = endOfDay(to).toISOString();
  return { fromTs, toTs };
}

const Ctx = React.createContext<DateRangeState | null>(null);

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRangeState] = React.useState<DateRange>(defaultRange);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      setRangeState(fromPersisted(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, []);

  const setRange = React.useCallback((next: DateRange | undefined) => {
    if (!next) {
      const fallback = defaultRange();
      setRangeState(fallback);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(fallback)));
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event(DATE_RANGE_CHANGED_EVENT));
      return;
    }

    const normalized: DateRange = { from: next.from ?? range.from ?? new Date(), to: next.to ?? next.from ?? range.to ?? new Date() };
    setRangeState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(normalized)));
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(DATE_RANGE_CHANGED_EVENT));
  }, [range.from, range.to]);

  const { fromTs, toTs } = bounds(range);

  const value = React.useMemo<DateRangeState>(
    () => ({ range, setRange, fromIso: fromTs, toIso: toTs }),
    [fromTs, range, setRange, toTs]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDateRange() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
