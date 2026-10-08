ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "activated_by" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "activated_at" timestamptz;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "superseded_by_rule_version_id" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "superseded_at" timestamptz;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "withdrawn_by" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "withdrawn_at" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "rule_versions_one_active_per_package_unique"
  ON "rule_versions" ("rule_package_id") WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "rule_release_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "event_type" text NOT NULL,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "related_rule_version_id" uuid,
  "note" text NOT NULL,
  "acted_by" uuid NOT NULL,
  "acted_at" timestamptz NOT NULL,
  CONSTRAINT "rule_release_events_type_check" CHECK ("event_type" IN ('activation', 'supersession', 'withdrawal'))
);
CREATE INDEX IF NOT EXISTS "rule_release_events_version_idx"
  ON "rule_release_events" ("rule_version_id", "acted_at");
CREATE INDEX IF NOT EXISTS "rule_release_events_type_idx"
  ON "rule_release_events" ("event_type", "acted_at");
