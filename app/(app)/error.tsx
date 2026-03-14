"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ShieldAlert } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-10">
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5 text-muted-foreground" />}
        title="Something went wrong"
        description={error.message}
        cta={{ label: "Try again", onClick: reset }}
      />
    </div>
  );
}
