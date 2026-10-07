ALTER TABLE "business_events" ADD COLUMN IF NOT EXISTS "import_row_id" uuid;
ALTER TABLE "business_events" ADD COLUMN IF NOT EXISTS "source_fingerprint" text;
CREATE UNIQUE INDEX IF NOT EXISTS "business_events_source_fingerprint_unique"
  ON "business_events" ("tenant_id", "company_id", "source_fingerprint");

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "import_type" text NOT NULL CHECK ("import_type" = 'bank_csv_v1'),
  "file_name" text NOT NULL,
  "file_hash" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('validated', 'has_errors', 'confirmed')),
  "total_rows" integer NOT NULL,
  "valid_rows" integer NOT NULL,
  "invalid_rows" integer NOT NULL,
  "duplicate_rows" integer NOT NULL,
  "batch_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confirmed_at" timestamptz,
  "confirmed_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS "import_batches_company_created_idx"
  ON "import_batches" ("tenant_id", "company_id", "created_at");

CREATE TABLE IF NOT EXISTS "bank_import_rows" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "batch_id" uuid NOT NULL REFERENCES "import_batches"("id"),
  "row_number" integer NOT NULL,
  "occurred_on" date,
  "description" text,
  "counterparty_name" text,
  "counterparty_id" uuid,
  "direction" text CHECK ("direction" IS NULL OR "direction" IN ('income', 'expense')),
  "amount" numeric(20,2),
  "balance" numeric(20,2),
  "fingerprint" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('valid', 'invalid', 'duplicate')),
  "errors" jsonb NOT NULL,
  "business_event_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bank_import_rows_batch_idx" ON "bank_import_rows" ("batch_id", "row_number");
