CREATE TABLE IF NOT EXISTS "golden_fixture_executions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "fixture_set_id" uuid NOT NULL REFERENCES "golden_fixture_sets"("id"),
  "implementation_key" text NOT NULL,
  "status" text NOT NULL,
  "total_fixtures" integer NOT NULL,
  "passed_fixtures" integer NOT NULL,
  "artifact_hash" text NOT NULL,
  "results" jsonb NOT NULL,
  "executed_by" uuid NOT NULL,
  "executed_at" timestamptz NOT NULL,
  CONSTRAINT "golden_fixture_executions_status_check" CHECK ("status" IN ('passed', 'failed')),
  CONSTRAINT "golden_fixture_executions_counts_check" CHECK (
    "total_fixtures" > 0 AND "passed_fixtures" >= 0 AND "passed_fixtures" <= "total_fixtures"
  ),
  CONSTRAINT "golden_fixture_executions_hash_check" CHECK ("artifact_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "golden_fixture_executions_artifact_unique"
  ON "golden_fixture_executions" ("rule_version_id", "artifact_hash");
CREATE INDEX IF NOT EXISTS "golden_fixture_executions_set_idx"
  ON "golden_fixture_executions" ("fixture_set_id", "executed_at");
