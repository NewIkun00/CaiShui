ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "tested_by" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "tested_at" timestamptz;

CREATE TABLE IF NOT EXISTS "rule_test_evidence" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "fixture_set_version" text NOT NULL,
  "total_fixtures" integer NOT NULL,
  "passed_fixtures" integer NOT NULL,
  "covered_scenarios" jsonb NOT NULL,
  "artifact_hash" text NOT NULL,
  "note" text NOT NULL,
  "signed_off_by" uuid NOT NULL,
  "signed_off_at" timestamptz NOT NULL,
  CONSTRAINT "rule_test_evidence_fixture_version_check" CHECK ("fixture_set_version" ~ '^\d{4}\.\d{2}\.\d{2}-\d+$'),
  CONSTRAINT "rule_test_evidence_all_passed_check" CHECK ("total_fixtures" > 0 AND "passed_fixtures" = "total_fixtures"),
  CONSTRAINT "rule_test_evidence_hash_check" CHECK ("artifact_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_test_evidence_version_unique" ON "rule_test_evidence" ("rule_version_id");
CREATE INDEX IF NOT EXISTS "rule_test_evidence_fixture_set_idx" ON "rule_test_evidence" ("fixture_set_version");
