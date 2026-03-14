"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { navItems, topLevelNavLabel } from "@/components/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useActiveOrg } from "@/lib/active-org/context";
import { useMe } from "@/lib/me/useMe";

function SidebarContent() {
  const pathname = usePathname();
  const { activeOrg, isLoading } = useActiveOrg();
  const { me } = useMe();
  const orgName = isLoading ? "Loading…" : activeOrg?.name ?? "—";
  const orgSlug = isLoading ? "—" : activeOrg?.slug ?? "—";
  const role = me?.membership?.role ?? null;

  const items = React.useMemo(() => {
    return navItems
      .map((item) => {
        if (!("children" in item) || item.label !== "Admin") return item;
        if (role === "admin") return item;
        if (role === "manager") {
          return { ...item, children: item.children.filter((c) => c.href === "/admin/jobs") };
        }
        return null;
      })
      .filter(Boolean) as typeof navItems;
  }, [role]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md border bg-card shadow-elev-1">
            <span className="text-xs font-semibold tracking-tight">TG</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">{topLevelNavLabel}</span>
        </Link>
      </div>
      <Separator />
      <nav className="no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 py-3">
        {items.map((item) => {
          if ("children" in item) {
            const GroupIcon = item.icon;
            const groupActive = item.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
            return (
              <div key={item.label} className="space-y-1">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground",
                    groupActive && "text-foreground"
                  )}
                >
                  <GroupIcon className="h-4 w-4" />
                  <span className="uppercase tracking-wide">{item.label}</span>
                </div>
                <div className="space-y-1 pl-6">
                  {item.children.map((child) => {
                    const active = pathname === child.href || pathname.startsWith(child.href + "/");
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "relative flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors duration-150",
                          "hover:bg-muted/60 hover:text-foreground",
                          active && "bg-muted text-foreground",
                          active &&
                            "before:absolute before:-left-3 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-foreground"
                        )}
                      >
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }

          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors duration-150",
                "hover:bg-muted/60 hover:text-foreground",
                active && "bg-muted text-foreground",
                active && "before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-3 text-xs text-muted-foreground">
        <div className="rounded-md border bg-card px-2 py-2">
          <div className="font-medium text-foreground">{orgName}</div>
          <div className="mt-0.5 flex items-center justify-between">
            <span>Org</span>
            <span className="text-[11px]">{orgSlug}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 border-r bg-card/20 backdrop-blur md:block">
        <SidebarContent />
      </aside>
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed left-3 top-3 z-50 h-9 w-9 rounded-md border bg-background/80 shadow-elev-1 backdrop-blur"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="h-dvh p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
