CREATE TABLE "filing_adjustment_work_orders" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "filing_task_id" uuid NOT NULL REFERENCES "filing_tasks"("id"),
  "source_package_id" uuid NOT NULL REFERENCES "filing_packages"("id"),
  "type" text NOT NULL,
  "reason" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "opened_at" timestamp with time zone NOT NULL,
  "opened_by" uuid NOT NULL,
  CONSTRAINT "filing_adjustment_type_check" CHECK ("type" IN ('void','correction','additional_tax','refund')),
  CONSTRAINT "filing_adjustment_evidence_check" CHECK (jsonb_typeof("evidence") = 'array')
);
CREATE INDEX "filing_adjustment_orders_company_idx" ON "filing_adjustment_work_orders" ("tenant_id","company_id","opened_at");
CREATE INDEX "filing_adjustment_orders_package_idx" ON "filing_adjustment_work_orders" ("tenant_id","company_id","source_package_id");

CREATE TABLE "filing_adjustment_work_order_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "work_order_id" uuid NOT NULL REFERENCES "filing_adjustment_work_orders"("id"),
  "version" integer NOT NULL,
  "status" text NOT NULL,
  "reviewed_by" uuid,
  "resolution_package_id" uuid REFERENCES "filing_packages"("id"),
  "resolution_evidence" jsonb NOT NULL,
  "resolution_note" text,
  "updated_at" timestamp with time zone NOT NULL,
  "updated_by" uuid NOT NULL,
  "action" text NOT NULL,
  "note" text NOT NULL,
  CONSTRAINT "filing_adjustment_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "filing_adjustment_status_check" CHECK ("status" IN ('open','in_review','resolved','cancelled')),
  CONSTRAINT "filing_adjustment_resolution_evidence_check" CHECK (jsonb_typeof("resolution_evidence") = 'array'),
  CONSTRAINT "filing_adjustment_resolved_check" CHECK (("status" = 'resolved' AND "resolution_note" IS NOT NULL AND jsonb_array_length("resolution_evidence") > 0) OR "status" <> 'resolved')
);
CREATE UNIQUE INDEX "filing_adjustment_versions_unique" ON "filing_adjustment_work_order_versions" ("work_order_id","version");
CREATE INDEX "filing_adjustment_versions_order_idx" ON "filing_adjustment_work_order_versions" ("work_order_id","version");
