CREATE TABLE IF NOT EXISTS "policy_sources" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_number" text NOT NULL,
  "title" text NOT NULL,
  "official_url" text NOT NULL,
  "issuing_authority" text NOT NULL,
  "published_on" date NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "summary" text NOT NULL,
  "content_hash" text NOT NULL,
  "captured_at" timestamptz NOT NULL,
  "last_verified_on" date NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CONSTRAINT "policy_sources_official_url_check" CHECK ("official_url" ~ '^https://([^/]+\.)?gov\.cn(/|$)'),
  CONSTRAINT "policy_sources_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "policy_sources_effective_range_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);
CREATE UNIQUE INDEX IF NOT EXISTS "policy_sources_document_hash_unique" ON "policy_sources" ("document_number", "content_hash");
CREATE INDEX IF NOT EXISTS "policy_sources_effective_range_idx" ON "policy_sources" ("effective_from", "effective_to");

CREATE TABLE IF NOT EXISTS "rule_packages" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "tax_type" text NOT NULL,
  "jurisdictions" jsonb NOT NULL,
  "description" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CONSTRAINT "rule_packages_code_check" CHECK ("code" ~ '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$'),
  CONSTRAINT "rule_packages_tax_type_check" CHECK ("tax_type" IN ('vat', 'surcharge', 'corporate_income_tax', 'stamp_duty'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_packages_code_unique" ON "rule_packages" ("code");
CREATE INDEX IF NOT EXISTS "rule_packages_tax_type_idx" ON "rule_packages" ("tax_type");

CREATE TABLE IF NOT EXISTS "rule_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "rule_package_id" uuid NOT NULL REFERENCES "rule_packages"("id"),
  "version_tag" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "applicability" jsonb NOT NULL,
  "calculation_implementation" text NOT NULL,
  "parameters" jsonb NOT NULL,
  "explanation" text NOT NULL,
  "content_hash" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CONSTRAINT "rule_versions_tag_check" CHECK ("version_tag" ~ '^\d{4}\.\d{2}\.\d{2}-\d+$'),
  CONSTRAINT "rule_versions_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rule_versions_effective_range_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "rule_versions_status_check" CHECK ("status" IN ('draft', 'technical_reviewed', 'tax_reviewed', 'tested', 'approved', 'scheduled', 'active', 'superseded', 'withdrawn'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_versions_package_tag_unique" ON "rule_versions" ("rule_package_id", "version_tag");
CREATE UNIQUE INDEX IF NOT EXISTS "rule_versions_package_hash_unique" ON "rule_versions" ("rule_package_id", "content_hash");
CREATE INDEX IF NOT EXISTS "rule_versions_effective_status_idx" ON "rule_versions" ("effective_from", "effective_to", "status");

CREATE TABLE IF NOT EXISTS "rule_version_policy_sources" (
  "rule_version_id" uuid NOT NULL REFERENCES "rule_versions"("id"),
  "policy_source_id" uuid NOT NULL REFERENCES "policy_sources"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rule_version_policy_sources_unique" ON "rule_version_policy_sources" ("rule_version_id", "policy_source_id");
CREATE INDEX IF NOT EXISTS "rule_version_policy_sources_source_idx" ON "rule_version_policy_sources" ("policy_source_id");
