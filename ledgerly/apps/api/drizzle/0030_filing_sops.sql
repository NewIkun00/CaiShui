CREATE TABLE "filing_sops" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "version_tag" text NOT NULL,
  "jurisdiction_code" text NOT NULL,
  "source_type" text NOT NULL,
  "source" jsonb NOT NULL,
  "steps" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "created_by" uuid NOT NULL,
  CONSTRAINT "filing_sops_source_type_check" CHECK ("source_type" IN ('test_fixture','official_notice')),
  CONSTRAINT "filing_sops_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "filing_sops_steps_check" CHECK (jsonb_typeof("steps") = 'array' AND jsonb_array_length("steps") > 0)
);
CREATE UNIQUE INDEX "filing_sops_version_unique" ON "filing_sops" ("tenant_id","jurisdiction_code","version_tag");
CREATE UNIQUE INDEX "filing_sops_hash_unique" ON "filing_sops" ("tenant_id","content_hash");
CREATE INDEX "filing_sops_tenant_idx" ON "filing_sops" ("tenant_id","jurisdiction_code");
