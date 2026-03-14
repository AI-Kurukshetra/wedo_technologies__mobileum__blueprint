export type JobName =
  | "cdrAggregationJob"
  | "ruleEvaluationJob"
  | "alertEscalationJob"
  | "metricsRefreshJob"
  | "scheduledReportsJob"
  | "realtimePipelineJob";

export type JobRunScope = { scope: "org"; orgId: string } | { scope: "all" };

export type JobRunResult = {
  job: JobName;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  details?: any;
  error?: string;
};
