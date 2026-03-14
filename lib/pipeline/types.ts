export type PipelineEventStatus = "pending" | "processing" | "processed" | "failed" | "dead_lettered";

export type PipelineEventRow = {
  id: string;
  org_id: string;
  event_type: string;
  status: PipelineEventStatus;
  dedup_key: string;
  payload: any;
  attempt_count: number;
  locked_at: string | null;
  locked_by: string | null;
  next_attempt_at: string | null;
  processed_at: string | null;
  dead_lettered_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CdrIngestedEventPayload = {
  source: "ingest_stream" | "csv_import";
  importId: string;
  fromIso: string;
  toIso: string;
  attemptedRows: number;
  errors: number;
};

