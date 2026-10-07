import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://ledgerly:ledgerly@localhost:5432/ledgerly',
  },
  strict: true,
  verbose: true,
});
