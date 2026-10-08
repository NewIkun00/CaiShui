ALTER TABLE "period_reopen_requests" ADD COLUMN IF NOT EXISTS "decision_reason" text;
ALTER TABLE "period_reopen_requests" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
ALTER TABLE "period_reopen_requests" ADD COLUMN IF NOT EXISTS "decided_by" uuid;

ALTER TABLE "period_reopen_requests" ADD CONSTRAINT "period_reopen_requests_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected'));
ALTER TABLE "period_reopen_requests" ADD CONSTRAINT "period_reopen_requests_decision_fields_check"
  CHECK (
    ("status" = 'pending' AND "decision_reason" IS NULL AND "decided_at" IS NULL AND "decided_by" IS NULL)
    OR
    ("status" IN ('approved', 'rejected') AND "decision_reason" IS NOT NULL AND "decided_at" IS NOT NULL AND "decided_by" IS NOT NULL)
  );
