"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function DataTableColumnHeader<TData>({ column, title, className }: { column: Column<TData>; title: string; className?: string }) {
  if (!column.getCanSort()) {
    return <div className={cn("text-xs font-medium text-muted-foreground", className)}>{title}</div>;
  }

  const dir = column.getIsSorted();
  const Icon = dir === "desc" ? ArrowDown : dir === "asc" ? ArrowUp : ChevronsUpDown;

  return (
    <Button
      variant="ghost"
      className={cn("h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground", className)}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      <span className="truncate">{title}</span>
      <Icon className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  );
}

