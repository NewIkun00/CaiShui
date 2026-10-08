CREATE TABLE IF NOT EXISTS "calculation_run_steps" (
  "id" uuid PRIMARY KEY NOT NULL,
  "calculation_run_id" uuid NOT NULL REFERENCES "calculation_runs"("id"),
  "sequence" integer NOT NULL,
  "key" text NOT NULL,
  "category" text NOT NULL,
  "status" text NOT NULL,
  "inputs" jsonb NOT NULL,
  "output" jsonb NOT NULL,
  "explanation" text NOT NULL,
  CONSTRAINT "calculation_run_steps_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "calculation_run_steps_category_check" CHECK ("category" IN ('validation', 'selection', 'calculation')),
  CONSTRAINT "calculation_run_steps_status_check" CHECK ("status" IN ('passed', 'blocked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "calculation_run_steps_sequence_unique"
  ON "calculation_run_steps" ("calculation_run_id", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "calculation_run_steps_key_unique"
  ON "calculation_run_steps" ("calculation_run_id", "key");
