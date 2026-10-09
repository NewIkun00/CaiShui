CREATE TABLE "filing_evidence" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "filing_task_id" uuid NOT NULL REFERENCES "filing_tasks"("id"),
  "filing_package_id" uuid NOT NULL REFERENCES "filing_packages"("id"),
  "kind" text NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "document_version" integer NOT NULL,
  "document_hash" text NOT NULL,
  "external_reference" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "reported_result_hash" text,
  "content_hash" text NOT NULL,
  "note" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "created_by" uuid NOT NULL,
  CONSTRAINT "filing_evidence_kind_check" CHECK ("kind" IN ('filing_receipt','tax_payment_proof')),
  CONSTRAINT "filing_evidence_document_version_check" CHECK ("document_version" > 0),
  CONSTRAINT "filing_evidence_document_hash_check" CHECK ("document_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_evidence_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_evidence_result_check" CHECK (("kind" = 'filing_receipt' AND "reported_result_hash" ~ '^[0-9a-f]{64}$') OR ("kind" = 'tax_payment_proof' AND "reported_result_hash" IS NULL))
);
CREATE UNIQUE INDEX "filing_evidence_content_unique" ON "filing_evidence" ("tenant_id","company_id","content_hash");
CREATE INDEX "filing_evidence_package_idx" ON "filing_evidence" ("tenant_id","company_id","filing_package_id","created_at");

CREATE TABLE "filing_closures" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "filing_task_id" uuid NOT NULL REFERENCES "filing_tasks"("id"),
  "filing_package_id" uuid NOT NULL REFERENCES "filing_packages"("id"),
  "package_content_hash" text NOT NULL,
  "result_hash" text NOT NULL,
  "evidence_ids" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "note" text NOT NULL,
  "closed_at" timestamp with time zone NOT NULL,
  "closed_by" uuid NOT NULL,
  CONSTRAINT "filing_closures_package_hash_check" CHECK ("package_content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_closures_result_hash_check" CHECK ("result_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_closures_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_closures_evidence_check" CHECK (jsonb_typeof("evidence_ids") = 'array' AND jsonb_array_length("evidence_ids") >= 2)
);
CREATE UNIQUE INDEX "filing_closures_package_unique" ON "filing_closures" ("filing_package_id");
CREATE UNIQUE INDEX "filing_closures_content_unique" ON "filing_closures" ("tenant_id","company_id","content_hash");
CREATE INDEX "filing_closures_company_idx" ON "filing_closures" ("tenant_id","company_id","closed_at");
