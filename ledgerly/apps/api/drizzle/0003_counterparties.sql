CREATE TABLE IF NOT EXISTS "counterparties" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "type" text NOT NULL CHECK ("type" IN ('customer', 'supplier', 'shareholder', 'employee', 'other')),
  "tax_id" text CHECK ("tax_id" IS NULL OR "tax_id" ~ '^[0-9A-Z]{18}$'),
  "contact_name" text,
  "phone" text,
  "notes" text,
  "is_related_party" boolean DEFAULT false NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CHECK ("type" <> 'shareholder' OR "is_related_party" = true)
);
CREATE UNIQUE INDEX IF NOT EXISTS "counterparties_company_type_name_unique"
  ON "counterparties" ("tenant_id", "company_id", "type", "normalized_name");
CREATE INDEX IF NOT EXISTS "counterparties_company_idx"
  ON "counterparties" ("tenant_id", "company_id");
