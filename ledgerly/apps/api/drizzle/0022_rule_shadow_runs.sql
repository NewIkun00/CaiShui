CREATE TABLE IF NOT EXISTS "rule_shadow_runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_package_id" uuid NOT NULL REFERENCES "rule_packages"("id"),
  "baseline_rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "candidate_rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "fixture_set_id" uuid NOT NULL REFERENCES "golden_fixture_sets"("id"),
  "fixture_set_content_hash" text NOT NULL,
  "baseline_implementation_key" text NOT NULL,
  "candidate_implementation_key" text NOT NULL,
  "status" text NOT NULL,
  "total_fixtures" integer NOT NULL,
  "identical_fixtures" integer NOT NULL,
  "changed_fixtures" integer NOT NULL,
  "failed_fixtures" integer NOT NULL,
  "artifact_hash" text NOT NULL,
  "differences" jsonb NOT NULL,
  "executed_by" uuid NOT NULL,
  "executed_at" timestamptz NOT NULL,
  CONSTRAINT "rule_shadow_runs_distinct_versions_check" CHECK ("baseline_rule_version_id" <> "candidate_rule_version_id"),
  CONSTRAINT "rule_shadow_runs_status_check" CHECK ("status" IN ('identical', 'differences_found', 'execution_failed')),
  CONSTRAINT "rule_shadow_runs_counts_check" CHECK (
    "total_fixtures" > 0 AND "identical_fixtures" >= 0 AND "changed_fixtures" >= 0 AND
    "failed_fixtures" >= 0 AND
    "identical_fixtures" + "changed_fixtures" + "failed_fixtures" = "total_fixtures"
  ),
  CONSTRAINT "rule_shadow_runs_hash_check" CHECK (
    "fixture_set_content_hash" ~ '^[0-9a-f]{64}$' AND "artifact_hash" ~ '^[0-9a-f]{64}$'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_shadow_runs_artifact_unique"
  ON "rule_shadow_runs" ("rule_package_id", "artifact_hash");
CREATE INDEX IF NOT EXISTS "rule_shadow_runs_versions_idx"
  ON "rule_shadow_runs" ("baseline_rule_version_id", "candidate_rule_version_id");
CREATE INDEX IF NOT EXISTS "rule_shadow_runs_package_time_idx"
  ON "rule_shadow_runs" ("rule_package_id", "executed_at");
