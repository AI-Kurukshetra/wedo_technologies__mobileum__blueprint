"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Gauge, Gavel, ListChecks, Moon, NotebookText, Settings, ShieldAlert, Sun, TowerControl } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

type PaletteItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
};

const navItems: PaletteItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge, shortcut: "G D" },
  { label: "CDR Imports", href: "/cdr/imports", icon: TowerControl, shortcut: "G I" },
  { label: "CDR Explorer", href: "/cdr/explorer", icon: TowerControl, shortcut: "G E" },
  { label: "Revenue leakage", href: "/analytics/revenue-leakage", icon: Gauge, shortcut: "G L" },
  { label: "Roaming", href: "/analytics/roaming", icon: Gauge, shortcut: "G O" },
  { label: "Interconnect", href: "/analytics/interconnect", icon: Gauge, shortcut: "G N" },
  { label: "Fraud patterns", href: "/analytics/fraud-patterns", icon: Gauge, shortcut: "G F" },
  { label: "Reconciliation", href: "/reconciliation", icon: Gauge, shortcut: "G Q" },
  { label: "Data quality", href: "/data-quality", icon: Gauge, shortcut: "G Y" },
  { label: "Reports", href: "/reports", icon: NotebookText, shortcut: "G P" },
  { label: "Rules", href: "/rules", icon: Gavel, shortcut: "G R" },
  { label: "Alerts", href: "/alerts", icon: ShieldAlert, shortcut: "G A" },
  { label: "Cases", href: "/cases", icon: ListChecks, shortcut: "G C" },
  { label: "Billing connectors", href: "/settings/billing-connectors", icon: Settings, shortcut: "G B" },
  { label: "Settings", href: "/settings", icon: Settings, shortcut: "G S" }
];

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [sequence, setSequence] = React.useState("");
  const [results, setResults] = React.useState<Array<{ type: string; id: string; title: string; subtitle?: string; href: string }> | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      if (open) return;

      // lightweight "g x" navigation shortcuts (inspired by Linear)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        const next = (sequence + key).slice(-2);
        setSequence(next);

        const go = (href: string) => {
          setSequence("");
          router.push(href);
        };

        if (next === "gd") return go("/dashboard");
        if (next === "ga") return go("/alerts");
        if (next === "gc") return go("/cases");
        if (next === "gr") return go("/rules");
        if (next === "gi") return go("/cdr/imports");
        if (next === "ge") return go("/cdr/explorer");
        if (next === "gs") return go("/settings");
        if (next === "gl") return go("/analytics/revenue-leakage");
        if (next === "go") return go("/analytics/roaming");
        if (next === "gn") return go("/analytics/interconnect");
        if (next === "gf") return go("/analytics/fraud-patterns");
        if (next === "gq") return go("/reconciliation");
        if (next === "gy") return go("/data-quality");
        if (next === "gb") return go("/settings/billing-connectors");
        if (next === "gp") return go("/reports");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router, sequence]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) throw new Error(j?.error ?? "Search failed");
          setResults(Array.isArray(j?.results) ? j.results : []);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setIsSearching(false));
    }, 180);

    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [open, query]);

  const run = (href: string) => {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(href);
  };

  return (
    <>
      <div className="hidden md:block">
        <Button
          variant="outline"
          className="h-9 w-[220px] justify-between text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <span>Search…</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">⌘</kbd>
            <kbd className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">K</kbd>
          </span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages, actions, alerts…" autoFocus />
            <CommandList>
              <CommandEmpty>
                {isSearching ? "Searching…" : query.trim().length >= 2 ? "No results." : "Type to search…"}
              </CommandEmpty>

              {results && results.length ? (
                <>
                  <CommandGroup heading="Results">
                    {results.map((r) => (
                      <CommandItem key={`${r.type}:${r.id}`} onSelect={() => run(r.href)}>
                        <span className="rounded-md border bg-muted/30 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {r.type}
                        </span>
                        <span className="truncate">{r.title}</span>
                        {r.subtitle ? <CommandShortcut>{r.subtitle}</CommandShortcut> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              ) : null}

              <CommandGroup heading="Navigate">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.href} onSelect={() => run(item.href)}>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                      {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Shortcuts">
                <CommandItem onSelect={() => setOpen(false)}>
                  <span className="text-muted-foreground">Open command palette</span>
                  <CommandShortcut>⌘ K</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>
                  <span className="text-muted-foreground">Quick search</span>
                  <CommandShortcut>/</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>
                  <span className="text-muted-foreground">Go to Alerts</span>
                  <CommandShortcut>G A</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Appearance">
                <CommandItem
                  onSelect={() => {
                    setTheme("light");
                    setOpen(false);
                  }}
                >
                  <Sun className="h-4 w-4 text-muted-foreground" />
                  Light
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setTheme("dark");
                    setOpen(false);
                  }}
                >
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  Dark
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setTheme("system");
                    setOpen(false);
                  }}
                >
                  <span className="h-4 w-4 rounded-sm border bg-muted/40" />
                  System
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
