ALTER TABLE "import_batches" ADD COLUMN "account_id" uuid;
ALTER TABLE "import_batches" ADD COLUMN "statement_period_start" date;
ALTER TABLE "import_batches" ADD COLUMN "statement_period_end" date;

UPDATE "import_batches" AS batch
SET "account_id" = initialization."account_id",
    "statement_period_start" = period."period_start",
    "statement_period_end" = period."period_end"
FROM "ledger_initializations" AS initialization
JOIN "accounting_periods" AS period ON period."id" = initialization."period_id"
WHERE initialization."tenant_id" = batch."tenant_id"
  AND initialization."company_id" = batch."company_id";

ALTER TABLE "import_batches" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "import_batches" ALTER COLUMN "statement_period_start" SET NOT NULL;
ALTER TABLE "import_batches" ALTER COLUMN "statement_period_end" SET NOT NULL;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id");
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_statement_period_check" CHECK ("statement_period_start" <= "statement_period_end");
CREATE INDEX "import_batches_statement_idx" ON "import_batches" ("tenant_id", "company_id", "account_id", "statement_period_start", "statement_period_end", "confirmed_at");

ALTER TABLE "reconciliation_check_issues" DROP CONSTRAINT "reconciliation_check_issues_code_check";
ALTER TABLE "reconciliation_check_issues" ADD CONSTRAINT "reconciliation_check_issues_code_check" CHECK (
  "code" IN ('INVOICE_OUTSTANDING', 'PAYMENT_UNALLOCATED', 'ACCOUNT_BALANCE_ROLLFORWARD_MISMATCH', 'TRIAL_BALANCE_UNBALANCED', 'BANK_STATEMENT_MISSING', 'BANK_LEDGER_BALANCE_MISMATCH')
);
ALTER TABLE "reconciliation_check_issues" DROP CONSTRAINT "reconciliation_check_issues_amount_check";
ALTER TABLE "reconciliation_check_issues" ADD CONSTRAINT "reconciliation_check_issues_amount_check" CHECK ("amount" >= 0);
