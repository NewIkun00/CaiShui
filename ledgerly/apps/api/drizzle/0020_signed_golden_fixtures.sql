CREATE TABLE IF NOT EXISTS "golden_fixture_sets" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "fixture_set_version" text NOT NULL,
  "content_hash" text NOT NULL,
  "redaction_attested" boolean NOT NULL,
  "professional_note" text NOT NULL,
  "signed_off_by" uuid NOT NULL,
  "signed_off_at" timestamptz NOT NULL,
  CONSTRAINT "golden_fixture_sets_version_check" CHECK ("fixture_set_version" ~ '^\d{4}\.\d{2}\.\d{2}-\d+$'),
  CONSTRAINT "golden_fixture_sets_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "golden_fixture_sets_redaction_check" CHECK ("redaction_attested" = true)
);
CREATE UNIQUE INDEX IF NOT EXISTS "golden_fixture_sets_version_unique"
  ON "golden_fixture_sets" ("rule_version_id", "fixture_set_version");
CREATE UNIQUE INDEX IF NOT EXISTS "golden_fixture_sets_hash_unique"
  ON "golden_fixture_sets" ("rule_version_id", "content_hash");

CREATE TABLE IF NOT EXISTS "golden_fixtures" (
  "id" uuid PRIMARY KEY NOT NULL,
  "fixture_set_id" uuid NOT NULL REFERENCES "golden_fixture_sets"("id"),
  "case_id" text NOT NULL,
  "scenario" text NOT NULL,
  "input" jsonb NOT NULL,
  "expected" jsonb NOT NULL,
  "explanation" text NOT NULL,
  CONSTRAINT "golden_fixtures_scenario_check" CHECK (
    "scenario" IN ('normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "golden_fixtures_case_unique"
  ON "golden_fixtures" ("fixture_set_id", "case_id");
CREATE INDEX IF NOT EXISTS "golden_fixtures_scenario_idx"
  ON "golden_fixtures" ("fixture_set_id", "scenario");
