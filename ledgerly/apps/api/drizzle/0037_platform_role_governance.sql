ALTER TABLE "outbox_events" ALTER COLUMN "tenant_id" DROP NOT NULL;

COMMENT ON COLUMN "outbox_events"."tenant_id" IS
  'Tenant-scoped events carry a tenant UUID; platform-wide identity governance events are NULL.';
