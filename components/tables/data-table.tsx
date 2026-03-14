"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState
} from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { DataTableColumnHeader } from "@/components/tables/column-header";

export type DataTableColumnDef<TData, TValue = unknown> = ColumnDef<TData, TValue>;

type Props<TData> = {
  columns: Array<DataTableColumnDef<TData, any>>;
  data: TData[];
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  initialPageSize?: number;
  empty?: { title: string; description?: string; cta?: { label: string; href?: string; onClick?: () => void } };
  getRowHref?: (row: TData) => string | null | undefined;
  className?: string;
};

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = "Filter…",
  initialPageSize = 10,
  empty,
  getRowHref,
  className
}: Props<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: initialPageSize } }
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn("rounded-lg border bg-card shadow-elev-1", className)}>
      <div className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 pl-9"
              aria-label="Filter table"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 md:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                View
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(Boolean(v))}
                  >
                    {col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="w-full max-h-[60vh] overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const headerDef = header.column.columnDef.header;
                  const rendered = header.isPlaceholder ? null : flexRender(headerDef, header.getContext());
                  const title = typeof headerDef === "string" ? headerDef : header.column.id;

                  return (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder ? null : (
                        typeof headerDef === "string" || headerDef == null ? (
                          <DataTableColumnHeader column={header.column as any} title={title} />
                        ) : (
                          rendered
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={getRowHref ? "cursor-pointer" : undefined}
                  onClick={() => {
                    if (!getRowHref) return;
                    const href = getRowHref(row.original as any);
                    if (!href) return;
                    router.push(href);
                  }}
                  onKeyDown={(e) => {
                    if (!getRowHref) return;
                    if (e.key !== "Enter") return;
                    const href = getRowHref(row.original as any);
                    if (!href) return;
                    router.push(href);
                  }}
                  tabIndex={getRowHref ? 0 : undefined}
                  role={getRowHref ? "link" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-5">
                  {empty ? (
                    <EmptyState title={empty.title} description={empty.description} cta={empty.cta} />
                  ) : (
                    <div className="text-sm text-muted-foreground">No results.</div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 border-t px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{rows.length}</span> of{" "}
          <span className="font-medium text-foreground">{table.getFilteredRowModel().rows.length}</span> results
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[120px] text-center text-xs text-muted-foreground">
            Page <span className="font-medium text-foreground">{table.getState().pagination.pageIndex + 1}</span> of{" "}
            <span className="font-medium text-foreground">{table.getPageCount()}</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
