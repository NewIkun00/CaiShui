import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const secretNames = [
  'R5_POSTGRES_PASSWORD',
  'R5_KEYCLOAK_DB_PASSWORD',
  'R5_KEYCLOAK_ADMIN_PASSWORD',
  'R5_OIDC_ADMIN_CLIENT_SECRET',
  'R5_ALICE_PASSWORD',
  'R5_BOB_PASSWORD',
  'R5_AUTH_COOKIE_KEY',
];

const requiredNames = [...secretNames, 'R5_KEYCLOAK_ADMIN', 'R5_ALICE_EMAIL', 'R5_BOB_EMAIL'];

const portDefaults = Object.freeze({
  R5_POSTGRES_PORT: 55432,
  R5_KEYCLOAK_DB_PORT: 55433,
  R5_KEYCLOAK_HTTPS_PORT: 58443,
  R5_KEYCLOAK_MANAGEMENT_PORT: 59000,
  R5_MAILPIT_SMTP_PORT: 51025,
  R5_MAILPIT_HTTP_PORT: 58080,
  R5_API_PORT: 3001,
  R5_WEB_PORT: 3020,
});

export function parseEnv(text) {
  const parsed = {};
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid environment line ${index + 1}`);
    const name = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name))
      throw new Error(`Invalid environment name on line ${index + 1}`);
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[name] = value;
  }
  return parsed;
}

export async function loadAcceptanceEnvironment(rootDirectory, input = process.env) {
  const envPath = resolve(
    rootDirectory,
    input.R5_ACCEPTANCE_ENV_FILE ?? 'tools/r5-acceptance/.env',
  );
  let fromFile = {};
  try {
    fromFile = parseEnv(await readFile(envPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { values: { ...fromFile, ...input }, envPath };
}

export function validateAcceptanceEnvironment(values, { requireSecrets = true } = {}) {
  const errors = [];
  if (requireSecrets) {
    for (const name of requiredNames) {
      if (!values[name]?.trim()) errors.push(`${name} is required`);
    }
    for (const name of secretNames.filter((item) => item !== 'R5_AUTH_COOKIE_KEY')) {
      const value = values[name];
      if (value && value.length < 12) errors.push(`${name} must contain at least 12 characters`);
    }
    if (values.R5_AUTH_COOKIE_KEY) {
      const decoded = Buffer.from(values.R5_AUTH_COOKIE_KEY, 'base64');
      if (decoded.length !== 32 || decoded.toString('base64') !== values.R5_AUTH_COOKIE_KEY) {
        errors.push('R5_AUTH_COOKIE_KEY must be a canonical Base64 encoded 32-byte key');
      }
    }
    if (values.R5_ALICE_EMAIL && values.R5_ALICE_EMAIL === values.R5_BOB_EMAIL) {
      errors.push('R5_ALICE_EMAIL and R5_BOB_EMAIL must be different');
    }
  }
  const ports = {};
  for (const [name, fallback] of Object.entries(portDefaults)) {
    const value = Number(values[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65_535)
      errors.push(`${name} must be a valid TCP port`);
    ports[name] = value;
  }
  if (new Set(Object.values(ports)).size !== Object.values(ports).length)
    errors.push('Acceptance ports must be unique');
  return { errors, ports };
}

export function publicConfiguration(values, ports) {
  return {
    postgresPort: ports.R5_POSTGRES_PORT,
    keycloakHttpsPort: ports.R5_KEYCLOAK_HTTPS_PORT,
    mailpitHttpPort: ports.R5_MAILPIT_HTTP_PORT,
    apiPort: ports.R5_API_PORT,
    webPort: ports.R5_WEB_PORT,
    aliceEmail: maskEmail(values.R5_ALICE_EMAIL),
    bobEmail: maskEmail(values.R5_BOB_EMAIL),
  };
}

function maskEmail(value) {
  if (!value) return undefined;
  const [local, domain] = value.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}
