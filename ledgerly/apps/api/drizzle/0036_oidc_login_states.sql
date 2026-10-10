CREATE TABLE IF NOT EXISTS "oidc_login_states" (
  "state_hash" text PRIMARY KEY,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "trace_id" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "oidc_login_states_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE INDEX IF NOT EXISTS "oidc_login_states_expiry_idx"
  ON "oidc_login_states" ("expires_at", "consumed_at");
