import { PageHeader } from "@/components/PageHeader";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import { CallVolumeChart } from "@/components/dashboard/call-volume-chart";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { AlertsBySeverityChart } from "@/components/dashboard/alerts-by-severity-chart";
import { TopDestinationsTable } from "@/components/tables/top-destinations";
import { RecentAlertsTable } from "@/components/tables/recent-alerts";
import { RecentCasesTable } from "@/components/tables/recent-cases";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Operational overview across CDRs, alerts, and cases." />

      <div className="rounded-xl border bg-card/30 p-3 shadow-elev-1">
        <DashboardKpis />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CallVolumeChart />
        </div>
        <div className="lg:col-span-4">
          <AlertsBySeverityChart />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RevenueTrendChart />
        </div>
        <div className="lg:col-span-4">
          <TopDestinationsTable />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <RecentAlertsTable />
        </div>
        <div className="lg:col-span-5">
          <RecentCasesTable />
        </div>
      </div>
    </div>
  );
}
