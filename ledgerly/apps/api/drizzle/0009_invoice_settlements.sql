CREATE TABLE IF NOT EXISTS "invoice_settlements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
  "payment_event_id" uuid NOT NULL REFERENCES "business_events"("id"),
  "amount" numeric(20, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_settlements_pair_unique" ON "invoice_settlements" USING btree ("invoice_id", "payment_event_id");
CREATE INDEX IF NOT EXISTS "invoice_settlements_company_idx" ON "invoice_settlements" USING btree ("tenant_id", "company_id");
