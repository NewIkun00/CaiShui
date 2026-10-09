CREATE TABLE IF NOT EXISTS "app_users" (
  "id" uuid PRIMARY KEY,
  "status" text NOT NULL CHECK ("status" IN ('pending_identity','active','disabled')),
  "display_name" text NOT NULL,
  "disabled_at" timestamptz,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS "app_users_status_idx" ON "app_users" ("status");

INSERT INTO "app_users" ("id","status","display_name","created_by","updated_by")
SELECT DISTINCT "user_id",'pending_identity','待关联身份',"user_id","user_id"
FROM "tenant_members"
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "tenant_members"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "roles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "company_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "invited_by" uuid,
  ADD COLUMN IF NOT EXISTS "activated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deactivated_at" timestamptz;
UPDATE "tenant_members"
SET "roles" = CASE "role"
  WHEN 'owner' THEN '["tenant_owner"]'::jsonb
  WHEN 'accountant' THEN '["bookkeeper"]'::jsonb
  WHEN 'reviewer' THEN '["member"]'::jsonb
  ELSE '["member"]'::jsonb
END
WHERE "roles" = '[]'::jsonb;
CREATE INDEX IF NOT EXISTS "tenant_members_status_idx" ON "tenant_members" ("tenant_id","status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_user_id_app_users_fk') THEN
    ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_app_users_fk"
      FOREIGN KEY ("user_id") REFERENCES "app_users"("id");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "external_identities" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "identifier_hint" text,
  "linked_at" timestamptz NOT NULL,
  "last_authenticated_at" timestamptz,
  CONSTRAINT "external_identities_https_issuer_check" CHECK ("issuer" ~ '^https://')
);
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_issuer_subject_unique" ON "external_identities" ("issuer","subject");
CREATE INDEX IF NOT EXISTS "external_identities_user_idx" ON "external_identities" ("user_id");

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "issuer" text NOT NULL,
  "provider_session_id" text NOT NULL,
  "auth_methods" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "authenticated_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "revoked_by" uuid,
  "revocation_reason" text,
  CONSTRAINT "auth_sessions_expiry_check" CHECK ("expires_at" > "authenticated_at"),
  CONSTRAINT "auth_sessions_revocation_evidence_check" CHECK (
    ("revoked_at" IS NULL AND "revoked_by" IS NULL AND "revocation_reason" IS NULL) OR
    ("revoked_at" IS NOT NULL AND "revoked_by" IS NOT NULL AND length(trim("revocation_reason")) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_provider_unique" ON "auth_sessions" ("issuer","provider_session_id");
CREATE INDEX IF NOT EXISTS "auth_sessions_user_active_idx" ON "auth_sessions" ("user_id","revoked_at","expires_at");

CREATE TABLE IF NOT EXISTS "tenant_invitations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "identifier_hash" text NOT NULL,
  "token_hash" text NOT NULL,
  "roles" jsonb NOT NULL,
  "company_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL CHECK ("status" IN ('pending','accepted','revoked','expired')),
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "accepted_by" uuid REFERENCES "app_users"("id"),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL,
  CONSTRAINT "tenant_invitations_acceptance_check" CHECK (
    ("status" = 'accepted' AND "accepted_at" IS NOT NULL AND "accepted_by" IS NOT NULL) OR
    ("status" <> 'accepted' AND "accepted_at" IS NULL AND "accepted_by" IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_invitations_token_hash_unique" ON "tenant_invitations" ("token_hash");
CREATE INDEX IF NOT EXISTS "tenant_invitations_tenant_status_idx" ON "tenant_invitations" ("tenant_id","status");

CREATE TABLE IF NOT EXISTS "tenant_member_roles" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "role" text NOT NULL CHECK ("role" IN ('tenant_owner','tenant_admin','bookkeeper','member')),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_member_roles_unique" ON "tenant_member_roles" ("tenant_id","user_id","role");
INSERT INTO "tenant_member_roles" ("tenant_id","user_id","role","created_by","updated_by")
SELECT "tenant_id","user_id",("roles"->>0),"created_by","updated_by"
FROM "tenant_members"
WHERE jsonb_array_length("roles") > 0
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "platform_role_assignments" (
  "user_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "role" text NOT NULL CHECK ("role" IN ('support_readonly','accounting_reviewer','tax_reviewer','rule_editor','rule_approver','security_auditor','platform_admin')),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','suspended','removed')),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_role_assignments_unique" ON "platform_role_assignments" ("user_id","role");
CREATE INDEX IF NOT EXISTS "platform_role_assignments_status_idx" ON "platform_role_assignments" ("status");
