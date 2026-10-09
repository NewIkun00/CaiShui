CREATE TABLE "filing_calendars" (
  "id" uuid PRIMARY KEY, "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"), "name" text NOT NULL, "version_tag" text NOT NULL,
  "jurisdiction_code" text NOT NULL, "year" integer NOT NULL CHECK ("year" BETWEEN 2020 AND 2100),
  "source_type" text NOT NULL CHECK ("source_type" IN ('test_fixture','official_notice')), "source" jsonb NOT NULL,
  "content_hash" text NOT NULL CHECK ("content_hash" ~ '^[0-9a-f]{64}$'), "created_at" timestamptz NOT NULL, "created_by" uuid NOT NULL
);
CREATE UNIQUE INDEX "filing_calendars_version_unique" ON "filing_calendars"("tenant_id","jurisdiction_code","year","version_tag");
CREATE UNIQUE INDEX "filing_calendars_hash_unique" ON "filing_calendars"("tenant_id","content_hash");
CREATE INDEX "filing_calendars_tenant_year_idx" ON "filing_calendars"("tenant_id","year");

CREATE TABLE "filing_calendar_entries" (
  "id" uuid PRIMARY KEY, "calendar_id" uuid NOT NULL REFERENCES "filing_calendars"("id"),
  "tax_type" text NOT NULL CHECK ("tax_type" IN ('vat','surcharge','corporate_income_tax','stamp_duty')),
  "label" text NOT NULL, "period_start" date NOT NULL, "period_end" date NOT NULL, "due_date" date NOT NULL,
  CHECK ("period_end" >= "period_start")
);
CREATE UNIQUE INDEX "filing_calendar_entries_natural_unique" ON "filing_calendar_entries"("calendar_id","tax_type","period_start","period_end");
CREATE INDEX "filing_calendar_entries_due_idx" ON "filing_calendar_entries"("calendar_id","due_date");

CREATE TABLE "filing_tasks" (
  "id" uuid PRIMARY KEY, "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"), "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "calendar_id" uuid NOT NULL REFERENCES "filing_calendars"("id"), "calendar_entry_id" uuid NOT NULL REFERENCES "filing_calendar_entries"("id"),
  "status" text NOT NULL CHECK ("status" IN ('todo','filed','paid')), "filed_at" timestamptz, "filed_by" uuid, "paid_at" timestamptz, "paid_by" uuid,
  "version" integer NOT NULL DEFAULT 1, "created_at" timestamptz NOT NULL DEFAULT now(), "created_by" uuid NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(), "updated_by" uuid NOT NULL
);
CREATE UNIQUE INDEX "filing_tasks_company_entry_unique" ON "filing_tasks"("tenant_id","company_id","calendar_entry_id");
CREATE INDEX "filing_tasks_todo_idx" ON "filing_tasks"("tenant_id","company_id","status");
CREATE INDEX "filing_tasks_calendar_idx" ON "filing_tasks"("calendar_id");

CREATE TABLE "filing_task_events" (
  "id" uuid PRIMARY KEY, "filing_task_id" uuid NOT NULL REFERENCES "filing_tasks"("id"), "event_type" text NOT NULL,
  "from_status" text NOT NULL, "to_status" text NOT NULL, "note" text NOT NULL, "task_version" integer NOT NULL,
  "acted_by" uuid NOT NULL, "acted_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "filing_task_events_version_unique" ON "filing_task_events"("filing_task_id","task_version");
CREATE INDEX "filing_task_events_task_idx" ON "filing_task_events"("filing_task_id","acted_at");
