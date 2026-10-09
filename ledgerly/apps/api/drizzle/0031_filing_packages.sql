CREATE TABLE "filing_packages" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "package_number" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  "status" text NOT NULL,
  "correction_of_package_id" uuid,
  "snapshot" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "frozen_at" timestamp with time zone,
  "frozen_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CONSTRAINT "filing_packages_status_check" CHECK ("status" IN ('draft','frozen')),
  CONSTRAINT "filing_packages_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_packages_blockers_check" CHECK (jsonb_typeof("blockers") = 'array'),
  CONSTRAINT "filing_packages_freeze_evidence_check" CHECK (("status" = 'draft' AND "frozen_at" IS NULL AND "frozen_by" IS NULL) OR ("status" = 'frozen' AND "frozen_at" IS NOT NULL AND "frozen_by" IS NOT NULL))
);
ALTER TABLE "filing_packages" ADD CONSTRAINT "filing_packages_correction_parent_fk" FOREIGN KEY ("correction_of_package_id") REFERENCES "filing_packages"("id");
CREATE INDEX "filing_packages_company_idx" ON "filing_packages" ("tenant_id","company_id","package_number");
CREATE INDEX "filing_packages_task_idx" ON "filing_packages" ("tenant_id","company_id","status");

CREATE TABLE "filing_package_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "filing_package_id" uuid NOT NULL REFERENCES "filing_packages"("id"),
  "event_type" text NOT NULL,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "note" text NOT NULL,
  "package_version" integer NOT NULL,
  "acted_by" uuid NOT NULL,
  "acted_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX "filing_package_events_version_unique" ON "filing_package_events" ("filing_package_id","package_version");
CREATE INDEX "filing_package_events_package_idx" ON "filing_package_events" ("filing_package_id","acted_at");
