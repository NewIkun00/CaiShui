ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "approved_by" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "approved_at" timestamptz;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "scheduled_by" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamptz;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "activation_at" timestamptz;

CREATE TABLE IF NOT EXISTS "rule_version_approvals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "note" text NOT NULL,
  "approved_by" uuid NOT NULL,
  "approved_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_version_approvals_version_unique"
  ON "rule_version_approvals" ("rule_version_id");
CREATE INDEX IF NOT EXISTS "rule_version_approvals_approved_at_idx"
  ON "rule_version_approvals" ("approved_at");

CREATE TABLE IF NOT EXISTS "rule_release_schedules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "activation_at" timestamptz NOT NULL,
  "note" text NOT NULL,
  "scheduled_by" uuid NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  CONSTRAINT "rule_release_schedules_future_check" CHECK ("activation_at" >= "scheduled_at")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_release_schedules_version_unique"
  ON "rule_release_schedules" ("rule_version_id");
CREATE INDEX IF NOT EXISTS "rule_release_schedules_activation_idx"
  ON "rule_release_schedules" ("activation_at");
