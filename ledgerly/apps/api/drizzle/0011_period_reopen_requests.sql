CREATE TABLE IF NOT EXISTS "period_reopen_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "period_id" uuid NOT NULL REFERENCES "accounting_periods"("id"),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone NOT NULL,
  "requested_by" uuid NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS "period_reopen_requests_company_idx" ON "period_reopen_requests" USING btree ("tenant_id", "company_id", "requested_at");
CREATE UNIQUE INDEX IF NOT EXISTS "period_reopen_requests_pending_unique" ON "period_reopen_requests" USING btree ("tenant_id", "company_id", "period_id") WHERE "status" = 'pending';
