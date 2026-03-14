import { Skeleton } from "@/components/ui/skeleton";

export function DataTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-lg border bg-card shadow-elev-1">
      <div className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-9 w-full md:w-80" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="p-3">
        <div className="grid gap-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

