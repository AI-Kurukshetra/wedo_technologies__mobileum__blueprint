"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const [isLoading, setIsLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [orgName, setOrgName] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

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
            <CardTitle>Create account</CardTitle>
            <CardDescription>Start monitoring fraud and revenue leakage.</CardDescription>
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
          <label className="text-xs font-medium text-muted-foreground" htmlFor="org">
            Organization (optional)
          </label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="org"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Telco"
              className="pl-9"
              autoComplete="organization"
            />
          </div>
        </div>

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
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <div className="text-xs text-muted-foreground">Use 8+ characters. You can change this later.</div>
        </div>

        <Button
          className="w-full"
          disabled={isLoading}
          onClick={async (e) => {
            e.preventDefault();
            setFormError(null);
            const trimmedEmail = email.trim();
            const trimmedOrg = orgName.trim();

            if (!trimmedEmail || !isValidEmail(trimmedEmail)) return setFormError("Enter a valid email address.");
            if (!password || password.length < 8) return setFormError("Password must be at least 8 characters.");

            setIsLoading(true);
            try {
              const supabase = createSupabaseBrowserClient();
              const { data, error } = await supabase.auth.signUp({
                email: trimmedEmail,
                password,
                options: {
                  data: trimmedOrg ? { org_name: trimmedOrg } : undefined
                }
              });

              if (error) {
                setFormError(error.message);
                return;
              }

              if (data.session) {
                toast.success("Account created");
                router.replace(nextPath);
                return;
              }

              toast.message("Check your email to confirm", {
                description: "If email confirmations are enabled, confirm your address, then sign in."
              });
              router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
            } finally {
              setIsLoading(false);
            }
          }}
        >
          {isLoading ? "Creating…" : "Create account"}
        </Button>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Already have an account?
          </Link>
          <span className="text-[11px]">TeleGuard Pro</span>
        </div>
      </CardContent>
    </Card>
  );
}
