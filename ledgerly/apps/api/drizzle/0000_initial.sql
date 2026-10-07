CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "companies" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "unified_social_credit_code" text NOT NULL,
  "province_code" text NOT NULL,
  "city_code" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('draft', 'active', 'suspended')),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "companies_tenant_credit_code_unique"
  ON "companies" ("tenant_id", "unified_social_credit_code");
CREATE INDEX IF NOT EXISTS "companies_tenant_id_idx" ON "companies" ("tenant_id");

CREATE TABLE IF NOT EXISTS "tenant_members" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('owner', 'accountant', 'reviewer', 'operator')),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_members_identity_unique"
  ON "tenant_members" ("tenant_id", "user_id");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid,
  "actor_id" uuid NOT NULL,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid,
  "outcome" text NOT NULL CHECK ("outcome" IN ('success', 'denied', 'failure')),
  "trace_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_events_tenant_occurred_idx"
  ON "audit_events" ("tenant_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "published_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "outbox_events_unpublished_idx"
  ON "outbox_events" ("published_at", "occurred_at");
