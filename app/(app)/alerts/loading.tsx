import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";

export default function AlertsLoading() {
  return (
    <div className="space-y-4">
      <LoadingSkeleton rows={3} />
      <DataTableSkeleton rows={10} />
    </div>
  );
}
