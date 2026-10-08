ALTER TABLE "reconciliation_check_issues" ALTER COLUMN "subject_id" TYPE text USING "subject_id"::text;
ALTER TABLE "reconciliation_check_issues" DROP CONSTRAINT "reconciliation_check_issues_code_check";
ALTER TABLE "reconciliation_check_issues" ADD CONSTRAINT "reconciliation_check_issues_code_check" CHECK (
  "code" IN ('INVOICE_OUTSTANDING', 'PAYMENT_UNALLOCATED', 'ACCOUNT_BALANCE_ROLLFORWARD_MISMATCH', 'TRIAL_BALANCE_UNBALANCED')
);
ALTER TABLE "reconciliation_check_issues" DROP CONSTRAINT "reconciliation_check_issues_subject_check";
ALTER TABLE "reconciliation_check_issues" ADD CONSTRAINT "reconciliation_check_issues_subject_check" CHECK (
  "subject_type" IN ('invoice', 'payment', 'account', 'ledger')
);
