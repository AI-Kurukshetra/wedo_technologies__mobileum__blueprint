"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(nextPath);
    });
  }, [router, nextPath]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md border bg-muted/40">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Access your fraud ops workspace.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {formError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        ) : null}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="analyst@acme.example"
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <div className="flex items-center justify-between">
          <Button
            disabled={isLoading}
            className="w-full"
            onClick={async (e) => {
              e.preventDefault();
              setFormError(null);
              const trimmedEmail = email.trim();
              if (!trimmedEmail || !isValidEmail(trimmedEmail)) return setFormError("Enter a valid email address.");
              if (!password) return setFormError("Enter your password.");

              setIsLoading(true);
              try {
                const supabase = createSupabaseBrowserClient();
                const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
                if (error) {
                  setFormError(error.message);
                  return;
                }
                toast.success("Welcome back");
                router.replace(nextPath);
              } finally {
                setIsLoading(false);
              }
            }}
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Link href="/signup" className="hover:text-foreground">
            Create an account
          </Link>
          <span className="text-[11px]">TeleGuard Pro</span>
        </div>
      </CardContent>
    </Card>
  );
}
