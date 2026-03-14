export type Subscriber = {
  id: string;
  org_id: string;
  msisdn: string;
  imsi: string | null;
  imei: string | null;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Network = {
  id: string;
  org_id: string;
  name: string;
  mcc: string | null;
  mnc: string | null;
  country_code: string | null;
  network_code: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Partner = {
  id: string;
  org_id: string;
  name: string;
  partner_type: string;
  country_code: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  org_id: string;
  name: string;
  service_type: string;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Tariff = {
  id: string;
  org_id: string;
  name: string;
  currency: string;
  effective_from: string | null;
  effective_to: string | null;
  rates: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Agreement = {
  id: string;
  org_id: string;
  partner_id: string;
  name: string;
  agreement_type: string;
  start_date: string | null;
  end_date: string | null;
  terms: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Settlement = {
  id: string;
  org_id: string;
  partner_id: string | null;
  agreement_id: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  amount_due: string;
  amount_paid: string;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Reconciliation = {
  id: string;
  org_id: string;
  name: string;
  source_a: string;
  source_b: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  metrics: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Report = {
  id: string;
  org_id: string;
  name: string;
  report_type: string;
  schedule_cron: string | null;
  last_run_at: string | null;
  config: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

