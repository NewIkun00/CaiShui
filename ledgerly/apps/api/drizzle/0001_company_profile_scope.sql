CREATE TABLE IF NOT EXISTS "company_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "entity_type" text NOT NULL,
  "vat_taxpayer_status" text NOT NULL,
  "vat_filing_cycle" text NOT NULL,
  "income_tax_collection" text NOT NULL,
  "industry" text NOT NULL,
  "has_inventory" boolean NOT NULL,
  "has_branches" boolean NOT NULL,
  "has_import_export" boolean NOT NULL,
  "has_foreign_currency" boolean NOT NULL,
  "has_special_vat_five_percent" boolean NOT NULL,
  "has_difference_tax" boolean NOT NULL,
  "has_cross_region_prepayment" boolean NOT NULL,
  "has_complex_payroll" boolean NOT NULL,
  "has_shareholder_transactions" boolean NOT NULL,
  "has_complex_tax_adjustments" boolean NOT NULL,
  "source_documents_complete" boolean NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_profiles_company_idx"
  ON "company_profiles" ("tenant_id", "company_id");

CREATE TABLE IF NOT EXISTS "scope_evaluations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "profile_id" uuid NOT NULL REFERENCES "company_profiles"("id"),
  "decision" text NOT NULL CHECK ("decision" IN ('green', 'yellow', 'red')),
  "reasons" jsonb NOT NULL,
  "next_action" text NOT NULL CHECK ("next_action" IN ('continue_setup', 'manual_review', 'unsupported')),
  "evaluated_at" timestamptz NOT NULL,
  "evaluated_by" uuid NOT NULL,
  "trace_id" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "scope_evaluations_company_idx"
  ON "scope_evaluations" ("tenant_id", "company_id", "evaluated_at");
