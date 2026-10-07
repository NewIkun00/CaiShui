CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "title" text NOT NULL,
  "accounting_month" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "current_version" integer DEFAULT 1 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS "documents_company_month_idx" ON "documents" USING btree ("tenant_id", "company_id", "accounting_month");

CREATE TABLE IF NOT EXISTS "document_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "version_number" integer NOT NULL,
  "file_name" text NOT NULL,
  "media_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256" text NOT NULL,
  "storage_key" text NOT NULL,
  "scan_status" text NOT NULL,
  "scan_engine" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_document_number_unique" ON "document_versions" USING btree ("document_id", "version_number");
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_company_hash_unique" ON "document_versions" USING btree ("tenant_id", "company_id", "sha256");

CREATE TABLE IF NOT EXISTS "evidence_links" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "business_event_id" uuid NOT NULL REFERENCES "business_events"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_links_document_event_unique" ON "evidence_links" USING btree ("document_id", "business_event_id");
CREATE INDEX IF NOT EXISTS "evidence_links_event_idx" ON "evidence_links" USING btree ("tenant_id", "company_id", "business_event_id");
