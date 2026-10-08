CREATE TABLE IF NOT EXISTS "calculation_runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "tax_type" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" text NOT NULL,
  "input_snapshot" jsonb NOT NULL,
  "input_hash" text NOT NULL,
  "rule_version_id" uuid REFERENCES "rule_versions"("id"),
  "rule_content_hash" text,
  "decision" jsonb,
  "created_at" timestamptz NOT NULL,
  "created_by" uuid NOT NULL,
  CONSTRAINT "calculation_runs_period_check" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "calculation_runs_status_check" CHECK ("status" IN ('ready', 'decision_required')),
  CONSTRAINT "calculation_runs_hash_check" CHECK ("input_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "calculation_runs_outcome_check" CHECK (
    ("status" = 'ready' AND "rule_version_id" IS NOT NULL AND "rule_content_hash" IS NOT NULL AND "decision" IS NULL)
    OR ("status" = 'decision_required' AND "rule_version_id" IS NULL AND "rule_content_hash" IS NULL AND "decision" IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS "calculation_runs_company_period_idx"
  ON "calculation_runs" ("tenant_id", "company_id", "period_start");
CREATE INDEX IF NOT EXISTS "calculation_runs_status_idx" ON "calculation_runs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "calculation_runs_input_hash_idx" ON "calculation_runs" ("input_hash");

CREATE TABLE IF NOT EXISTS "calculation_run_facts" (
  "calculation_run_id" uuid NOT NULL REFERENCES "calculation_runs"("id"),
  "business_event_id" uuid NOT NULL REFERENCES "business_events"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "calculation_run_facts_unique"
  ON "calculation_run_facts" ("calculation_run_id", "business_event_id");
CREATE INDEX IF NOT EXISTS "calculation_run_facts_event_idx" ON "calculation_run_facts" ("business_event_id");
