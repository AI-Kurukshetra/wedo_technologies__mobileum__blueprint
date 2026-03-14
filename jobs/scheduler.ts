import type { ScheduledTask } from "node-cron";

import { runJob } from "@/jobs/run";

declare global {
  // eslint-disable-next-line no-var
  var __tgproJobSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __tgproCronTasks: ScheduledTask[] | undefined;
}

export async function startJobScheduler() {
  if (globalThis.__tgproJobSchedulerStarted) return;
  globalThis.__tgproJobSchedulerStarted = true;

  const mod: any = await import("node-cron");
  const cron = (mod?.default ?? mod) as typeof import("node-cron");

  const tasks: ScheduledTask[] = [];

  // cdr aggregation → every 5 minutes
  tasks.push(cron.schedule("*/5 * * * *", () => void runJob("cdrAggregationJob", { scope: "all" })));
  // rule evaluation → every 2 minutes
  tasks.push(cron.schedule("*/2 * * * *", () => void runJob("ruleEvaluationJob", { scope: "all" })));
  // alert escalation → every 10 minutes
  tasks.push(cron.schedule("*/10 * * * *", () => void runJob("alertEscalationJob", { scope: "all" })));
  // metrics refresh → every 5 minutes
  tasks.push(cron.schedule("*/5 * * * *", () => void runJob("metricsRefreshJob", { scope: "all" })));
  // scheduled reports → every 15 minutes
  tasks.push(cron.schedule("*/15 * * * *", () => void runJob("scheduledReportsJob", { scope: "all" })));
  // real-time pipeline processing → every minute
  tasks.push(cron.schedule("* * * * *", () => void runJob("realtimePipelineJob", { scope: "all" })));

  globalThis.__tgproCronTasks = tasks;
}
