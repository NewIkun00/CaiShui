CREATE TABLE IF NOT EXISTS "business_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "event_type" text NOT NULL CHECK ("event_type" IN ('service_completed', 'invoice_issued', 'money_received', 'expense_incurred', 'money_paid', 'capital_contribution', 'shareholder_advance')),
  "occurred_on" date NOT NULL,
  "amount" numeric(20,2) NOT NULL CHECK ("amount" > 0),
  "counterparty_id" uuid NOT NULL REFERENCES "counterparties"("id"),
  "description" text NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL CHECK ("source" IN ('manual', 'import')),
  "status" text DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft', 'confirmed')),
  "confirmed_at" timestamptz,
  "confirmed_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CHECK (("status" = 'draft' AND "confirmed_at" IS NULL AND "confirmed_by" IS NULL) OR ("status" = 'confirmed' AND "confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "business_events_company_date_idx"
  ON "business_events" ("tenant_id", "company_id", "occurred_on");
