import type * as React from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { TopNavbar } from "@/components/TopNavbar";
import { ActiveOrgProvider } from "@/lib/active-org/context";
import { DateRangeProvider } from "@/lib/date-range/context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveOrgProvider>
      <DateRangeProvider>
        <div className="min-h-dvh bg-background">
          <div className="mx-auto flex w-full max-w-[1400px]">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopNavbar />
              <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-8">{children}</main>
            </div>
          </div>
        </div>
      </DateRangeProvider>
    </ActiveOrgProvider>
  );
}
