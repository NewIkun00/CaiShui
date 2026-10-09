CREATE TABLE "review_cases" (
  "id" uuid PRIMARY KEY, "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"), "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "source_type" text NOT NULL CHECK ("source_type" IN ('reconciliation_issue','period_reopen_request')), "source_id" uuid NOT NULL,
  "risk_level" text NOT NULL CHECK ("risk_level" IN ('yellow','red')), "blocks_filing" boolean NOT NULL, "summary" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('open','awaiting_documents','in_review','approved','rejected','cancelled')), "assigned_to" uuid,
  "version" integer NOT NULL DEFAULT 1, "created_at" timestamptz NOT NULL DEFAULT now(), "created_by" uuid NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(), "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX "review_cases_source_unique" ON "review_cases"("tenant_id","company_id","source_type","source_id");
CREATE INDEX "review_cases_queue_idx" ON "review_cases"("tenant_id","company_id","status","risk_level");
CREATE INDEX "review_cases_assignee_idx" ON "review_cases"("tenant_id","assigned_to","status");
CREATE TABLE "review_case_events" (
  "id" uuid PRIMARY KEY, "review_case_id" uuid NOT NULL REFERENCES "review_cases"("id"), "event_type" text NOT NULL,
  "from_status" text NOT NULL, "to_status" text NOT NULL, "note" text NOT NULL, "case_version" integer NOT NULL,
  "acted_by" uuid NOT NULL, "acted_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "review_case_events_version_unique" ON "review_case_events"("review_case_id","case_version");
CREATE INDEX "review_case_events_case_idx" ON "review_case_events"("review_case_id","acted_at");
CREATE TABLE "review_case_work_items" (
  "id" uuid PRIMARY KEY, "review_case_id" uuid NOT NULL REFERENCES "review_cases"("id"), "kind" text NOT NULL CHECK ("kind" IN ('workpaper','document_request')),
  "content" text NOT NULL, "document_ids" jsonb NOT NULL DEFAULT '[]'::jsonb, "created_at" timestamptz NOT NULL, "created_by" uuid NOT NULL
);
CREATE INDEX "review_case_work_items_case_idx" ON "review_case_work_items"("review_case_id","created_at");
