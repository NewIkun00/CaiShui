ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "reversed_at" timestamp with time zone;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "reversal_of_voucher_id" uuid REFERENCES "vouchers"("id");
CREATE UNIQUE INDEX IF NOT EXISTS "vouchers_reversal_of_unique" ON "vouchers" USING btree ("reversal_of_voucher_id");
