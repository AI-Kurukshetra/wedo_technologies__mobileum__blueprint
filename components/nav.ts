import { Activity, ClipboardList, FileSpreadsheet, Gauge, Gavel, HeartPulse, LineChart, ListChecks, NotebookText, Search, Settings, ShieldAlert, TowerControl, Users } from "lucide-react";
import type { ComponentType } from "react";

export type NavLeaf = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavGroup = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: NavLeaf[];
};

export type NavItem = NavLeaf | NavGroup;

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  {
    label: "CDR",
    icon: TowerControl,
    children: [
      { label: "Imports", href: "/cdr/imports", icon: FileSpreadsheet },
      { label: "Explorer", href: "/cdr/explorer", icon: Search }
    ]
  },
  {
    label: "Analytics",
    icon: LineChart,
    children: [
      { label: "Revenue leakage", href: "/analytics/revenue-leakage", icon: Activity },
      { label: "Roaming", href: "/analytics/roaming", icon: Activity },
      { label: "Interconnect", href: "/analytics/interconnect", icon: Activity },
      { label: "Fraud patterns", href: "/analytics/fraud-patterns", icon: Activity },
      { label: "Reconciliation", href: "/reconciliation", icon: Activity }
    ]
  },
  { label: "Data quality", href: "/data-quality", icon: Activity },
  { label: "Reports", href: "/reports", icon: NotebookText },
  { label: "Rules", href: "/rules", icon: Gavel },
  { label: "Alerts", href: "/alerts", icon: ShieldAlert },
  { label: "Cases", href: "/cases", icon: ListChecks },
  {
    label: "Settings",
    icon: Settings,
    children: [
      { label: "General", href: "/settings", icon: Settings },
      { label: "Billing connectors", href: "/settings/billing-connectors", icon: Activity }
    ]
  },
  {
    label: "Admin",
    icon: Users,
    children: [
      { label: "System health", href: "/admin/system-health", icon: HeartPulse },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Audit logs", href: "/admin/audit-logs", icon: ClipboardList },
      { label: "Pipeline", href: "/admin/pipeline", icon: Activity },
      { label: "Jobs", href: "/admin/jobs", icon: Activity },
      { label: "Network elements", href: "/network-elements", icon: Activity }
    ]
  }
];

export const topLevelNavLabel = "TeleGuard Pro";
