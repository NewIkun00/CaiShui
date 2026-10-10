ALTER TABLE "tenant_invitations"
  ADD COLUMN IF NOT EXISTS "identifier_hint" text;

UPDATE "tenant_invitations"
SET "identifier_hint" = '***'
WHERE "identifier_hint" IS NULL;

ALTER TABLE "tenant_invitations"
  ALTER COLUMN "identifier_hint" SET NOT NULL;
