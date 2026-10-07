ALTER TABLE "opening_balances" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'none' NOT NULL;
CREATE TABLE IF NOT EXISTS "opening_balance_entries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "opening_balance_id" uuid NOT NULL REFERENCES "opening_balances"("id"),
  "line_number" integer NOT NULL,
  "account_code" text NOT NULL,
  "account_name" text NOT NULL,
  "side" text NOT NULL,
  "amount" numeric(20, 2) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "opening_balance_entries_balance_line_unique" ON "opening_balance_entries" USING btree ("opening_balance_id", "line_number");
