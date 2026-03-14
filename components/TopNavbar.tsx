"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, User } from "lucide-react";
import { toast } from "sonner";

import { DateRangePicker } from "@/components/date-range-picker";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeToggleMenuItem } from "@/components/theme-toggle";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useDateRange } from "@/lib/date-range/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

export function TopNavbar() {
  const router = useRouter();
  const [email, setEmail] = React.useState<string | null>(null);
  const { range, setRange } = useDateRange();

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur">
      <div className="flex w-full items-center gap-3 px-4 py-3 md:px-6">
        <div className="hidden md:block">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-start">
          <CommandPalette />
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <OrgSwitcher />
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2">
                <span className="hidden max-w-[180px] truncate text-sm md:inline">
                  {email ?? "Loading…"}
                </span>
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="space-y-1">
                <div className="truncate text-sm font-medium text-foreground">{email ?? "—"}</div>
                <div className="truncate text-xs font-normal text-muted-foreground">Account</div>
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <ThemeToggleMenuItem />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  (async () => {
                    const supabase = createSupabaseBrowserClient();
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    router.replace("/login");
                    router.refresh();
                  })()
                }
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Open menu">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Menu</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => toast.message("Tip: Press ⌘K", { description: "Opens command palette for navigation and search." })}>
                Command palette
              </DropdownMenuItem>
              <DropdownMenuItem>
                <div className="w-full">
                  <div className="text-xs text-muted-foreground">Date range</div>
                  <div className="mt-2">
                    <DateRangePicker compact value={range} onChange={setRange} />
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <ThemeToggleMenuItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  (async () => {
                    const supabase = createSupabaseBrowserClient();
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    router.replace("/login");
                    router.refresh();
                  })()
                }
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
