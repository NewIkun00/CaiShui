ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "technical_reviewed_by" uuid;
ALTER TABLE "rule_versions" ADD COLUMN IF NOT EXISTS "tax_reviewed_by" uuid;

CREATE TABLE IF NOT EXISTS "rule_version_reviews" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "review_kind" text NOT NULL,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "note" text NOT NULL,
  "reviewed_by" uuid NOT NULL,
  "reviewed_at" timestamptz NOT NULL,
  CONSTRAINT "rule_version_reviews_kind_check" CHECK ("review_kind" IN ('technical', 'tax')),
  CONSTRAINT "rule_version_reviews_transition_check" CHECK (
    ("review_kind" = 'technical' AND "from_status" = 'draft' AND "to_status" = 'technical_reviewed') OR
    ("review_kind" = 'tax' AND "from_status" = 'technical_reviewed' AND "to_status" = 'tax_reviewed')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_version_reviews_kind_unique" ON "rule_version_reviews" ("rule_version_id", "review_kind");
CREATE INDEX IF NOT EXISTS "rule_version_reviews_version_idx" ON "rule_version_reviews" ("rule_version_id", "reviewed_at");
