CREATE TABLE IF NOT EXISTS "vouchers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "voucher_date" date NOT NULL,
  "summary" text NOT NULL,
  "source_business_event_id" uuid NOT NULL REFERENCES "business_events"("id"),
  "template_version" text NOT NULL,
  "rule_version" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vouchers_source_rule_unique" ON "vouchers" USING btree ("tenant_id", "company_id", "source_business_event_id", "rule_version");
CREATE INDEX IF NOT EXISTS "vouchers_company_date_idx" ON "vouchers" USING btree ("tenant_id", "company_id", "voucher_date");

CREATE TABLE IF NOT EXISTS "voucher_entries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "voucher_id" uuid NOT NULL REFERENCES "vouchers"("id"),
  "line_number" integer NOT NULL,
  "account_code" text NOT NULL,
  "account_name" text NOT NULL,
  "side" text NOT NULL,
  "amount" numeric(20, 2) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_entries_voucher_line_unique" ON "voucher_entries" USING btree ("voucher_id", "line_number");
