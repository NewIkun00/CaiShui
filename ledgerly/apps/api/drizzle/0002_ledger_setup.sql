CREATE TABLE IF NOT EXISTS "financial_accounts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "account_type" text NOT NULL CHECK ("account_type" IN ('bank', 'cash')),
  "bank_name" text,
  "account_number_last4" text CHECK ("account_number_last4" IS NULL OR "account_number_last4" ~ '^\d{4}$'),
  "currency" text DEFAULT 'CNY' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CHECK ("account_type" <> 'bank' OR ("bank_name" IS NOT NULL AND "account_number_last4" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "financial_accounts_company_idx" ON "financial_accounts" ("tenant_id", "company_id");

CREATE TABLE IF NOT EXISTS "accounting_periods" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" text DEFAULT 'open' NOT NULL CHECK ("status" IN ('open', 'locked', 'closed')),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CHECK ("period_start" <= "period_end")
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_company_range_unique"
  ON "accounting_periods" ("tenant_id", "company_id", "period_start", "period_end");

CREATE TABLE IF NOT EXISTS "opening_balances" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "account_id" uuid NOT NULL REFERENCES "financial_accounts"("id"),
  "amount" numeric(20,2) NOT NULL,
  "balance_as_of" date NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "ledger_initializations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "account_id" uuid NOT NULL REFERENCES "financial_accounts"("id"),
  "period_id" uuid NOT NULL REFERENCES "accounting_periods"("id"),
  "opening_balance_id" uuid NOT NULL REFERENCES "opening_balances"("id"),
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_initializations_company_unique"
  ON "ledger_initializations" ("tenant_id", "company_id");
