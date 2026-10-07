CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "direction" text NOT NULL,
  "kind" text NOT NULL,
  "color" text NOT NULL,
  "invoice_number" text NOT NULL,
  "issued_on" date NOT NULL,
  "counterparty_id" uuid NOT NULL REFERENCES "counterparties"("id"),
  "amount_excluding_tax" numeric(20, 2) NOT NULL,
  "tax_amount" numeric(20, 2) NOT NULL,
  "total_amount" numeric(20, 2) NOT NULL,
  "remarks" text,
  "source" text DEFAULT 'manual' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "confirmed_at" timestamp with time zone,
  "confirmed_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_company_direction_number_unique"
  ON "invoices" USING btree ("tenant_id", "company_id", "direction", "invoice_number");
CREATE INDEX IF NOT EXISTS "invoices_company_date_idx"
  ON "invoices" USING btree ("tenant_id", "company_id", "issued_on");
