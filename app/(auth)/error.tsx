"use client";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="w-full">
      <EmptyState title="Unable to load" description={error.message} cta={{ label: "Try again", onClick: reset }} />
      <div className="mt-4 text-center">
        <Button variant="ghost" onClick={() => location.assign("/login")}>
          Back to login
        </Button>
      </div>
    </div>
  );
}
