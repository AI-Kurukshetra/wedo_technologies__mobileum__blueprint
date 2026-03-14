import { startJobScheduler } from "@/jobs/scheduler";

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for background jobs.");
  }

  await startJobScheduler();
  // eslint-disable-next-line no-console
  console.log("[tgpro] job scheduler started (node-cron)");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[tgpro] job scheduler failed:", e);
  process.exit(1);
});

