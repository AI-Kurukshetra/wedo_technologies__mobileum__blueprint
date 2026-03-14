"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";

import { useActiveOrg } from "@/lib/active-org/context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export function OrgSwitcher({ className }: { className?: string }) {
  const { orgs, activeOrg, isLoading, setActiveOrgId } = useActiveOrg();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-9 gap-2", className)} aria-label="Switch organization">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[180px] truncate text-sm">
            {isLoading ? "Loading…" : activeOrg?.name ?? "No org"}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.length ? (
          orgs.map((org) => {
            const selected = activeOrg?.id === org.id;
            return (
              <DropdownMenuItem
                key={org.id}
                className="flex items-center justify-between"
                onClick={() => void setActiveOrgId(org.id)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{org.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{org.slug}</div>
                </div>
                <Check className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
              </DropdownMenuItem>
            );
          })
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground">No organizations found.</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

