import type { JobName, JobRunResult, JobRunScope } from "@/jobs/types";
import { runCdrAggregationJob } from "@/jobs/cdrAggregationJob";
import { runRuleEvaluationJob } from "@/jobs/ruleEvaluationJob";
import { runAlertEscalationJob } from "@/jobs/alertEscalationJob";
import { runMetricsRefreshJob } from "@/jobs/metricsRefreshJob";
import { runScheduledReportsJob } from "@/jobs/scheduledReportsJob";
import { runRealtimePipelineJob } from "@/jobs/realtimePipelineJob";

declare global {
  // eslint-disable-next-line no-var
  var __tgproJobRunning: Record<string, boolean> | undefined;
}

function runningMap() {
  if (!globalThis.__tgproJobRunning) globalThis.__tgproJobRunning = {};
  return globalThis.__tgproJobRunning;
}

export async function runJob(job: JobName, scope: JobRunScope): Promise<JobRunResult> {
  const startedAt = new Date().toISOString();
  const running = runningMap();
  const key = `${job}:${scope.scope === "all" ? "all" : scope.orgId}`;
  if (running[key]) {
    return { job, startedAt, finishedAt: new Date().toISOString(), ok: true, details: { skipped: true, reason: "already_running" } };
  }

  running[key] = true;
  try {
    let details: any;
    if (job === "cdrAggregationJob") details = await runCdrAggregationJob(scope);
    else if (job === "ruleEvaluationJob") details = await runRuleEvaluationJob(scope);
    else if (job === "alertEscalationJob") details = await runAlertEscalationJob(scope);
    else if (job === "metricsRefreshJob") details = await runMetricsRefreshJob(scope);
    else if (job === "scheduledReportsJob") details = await runScheduledReportsJob(scope);
    else if (job === "realtimePipelineJob") details = await runRealtimePipelineJob(scope);
    else details = { skipped: true, reason: "unknown_job" };

    return { job, startedAt, finishedAt: new Date().toISOString(), ok: true, details };
  } catch (e: any) {
    return { job, startedAt, finishedAt: new Date().toISOString(), ok: false, error: e?.message ?? "Job failed" };
  } finally {
    running[key] = false;
  }
}
