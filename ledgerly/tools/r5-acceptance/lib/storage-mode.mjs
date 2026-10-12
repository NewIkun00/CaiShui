export function validatePostgresSimulationEnvironment(environment) {
  if (environment.R5_ACCEPTANCE_CONFIRM_ISOLATED_DATABASE !== 'true') {
    throw new Error(
      'Set R5_ACCEPTANCE_CONFIRM_ISOLATED_DATABASE=true only for a disposable acceptance database',
    );
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required for simulate-postgres');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must name an isolated acceptance database');
  }
  return { databaseUrl };
}
