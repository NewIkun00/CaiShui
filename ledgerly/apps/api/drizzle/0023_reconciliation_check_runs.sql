CREATE TABLE IF NOT EXISTS "reconciliation_check_runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "period_id" uuid NOT NULL REFERENCES "accounting_periods"("id"),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "input_snapshot" jsonb NOT NULL,
  "input_hash" text NOT NULL,
  "grade" text NOT NULL,
  "blocks_filing" boolean NOT NULL,
  "total_issues" integer NOT NULL,
  "yellow_issues" integer NOT NULL,
  "red_issues" integer NOT NULL,
  "created_at" timestamptz NOT NULL,
  "created_by" uuid NOT NULL,
  CONSTRAINT "reconciliation_check_runs_hash_check" CHECK ("input_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reconciliation_check_runs_grade_check" CHECK ("grade" IN ('green', 'yellow', 'red')),
  CONSTRAINT "reconciliation_check_runs_counts_check" CHECK (
    "total_issues" >= 0 AND "yellow_issues" >= 0 AND "red_issues" >= 0 AND
    "yellow_issues" + "red_issues" = "total_issues"
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_check_runs_input_unique"
  ON "reconciliation_check_runs" ("tenant_id", "company_id", "period_id", "input_hash");
CREATE INDEX IF NOT EXISTS "reconciliation_check_runs_company_time_idx"
  ON "reconciliation_check_runs" ("tenant_id", "company_id", "created_at");

CREATE TABLE IF NOT EXISTS "reconciliation_check_issues" (
  "id" uuid PRIMARY KEY NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "reconciliation_check_runs"("id"),
  "code" text NOT NULL,
  "severity" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "amount" numeric(20, 2) NOT NULL,
  "message" text NOT NULL,
  "suggested_action" text NOT NULL,
  "triage_status" text NOT NULL DEFAULT 'open',
  "triage_version" integer NOT NULL DEFAULT 1,
  "triage_note" text,
  "triaged_by" uuid,
  "triaged_at" timestamptz,
  CONSTRAINT "reconciliation_check_issues_code_check" CHECK ("code" IN ('INVOICE_OUTSTANDING', 'PAYMENT_UNALLOCATED')),
  CONSTRAINT "reconciliation_check_issues_severity_check" CHECK ("severity" IN ('yellow', 'red')),
  CONSTRAINT "reconciliation_check_issues_subject_check" CHECK ("subject_type" IN ('invoice', 'payment')),
  CONSTRAINT "reconciliation_check_issues_triage_check" CHECK ("triage_status" IN ('open', 'investigating', 'needs_documents', 'ready_for_recheck')),
  CONSTRAINT "reconciliation_check_issues_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "reconciliation_check_issues_triage_version_check" CHECK ("triage_version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_check_issues_subject_unique"
  ON "reconciliation_check_issues" ("run_id", "code", "subject_id");
CREATE INDEX IF NOT EXISTS "reconciliation_check_issues_run_idx" ON "reconciliation_check_issues" ("run_id");

CREATE TABLE IF NOT EXISTS "reconciliation_issue_triage_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "issue_id" uuid NOT NULL REFERENCES "reconciliation_check_issues"("id"),
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "note" text NOT NULL,
  "version" integer NOT NULL,
  "actor_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "reconciliation_issue_triage_events_status_check" CHECK (
    "from_status" IN ('open', 'investigating', 'needs_documents', 'ready_for_recheck') AND
    "to_status" IN ('investigating', 'needs_documents', 'ready_for_recheck')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_issue_triage_events_version_unique"
  ON "reconciliation_issue_triage_events" ("issue_id", "version");
CREATE INDEX IF NOT EXISTS "reconciliation_issue_triage_events_issue_time_idx"
  ON "reconciliation_issue_triage_events" ("issue_id", "created_at");
