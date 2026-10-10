import { Pool } from 'pg';
import {
  bootstrapPlatformAdministrator,
  platformAdminBootstrapConfiguration,
} from './bootstrap-platform-admin.js';

async function main() {
  const { userId, connectionString } = platformAdminBootstrapConfiguration(
    process.env,
    process.argv[2],
  );
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await bootstrapPlatformAdministrator(
      {
        query: (text, values) => client.query(text, values ? [...values] : undefined),
      },
      userId,
    );
    process.stdout.write(`Platform administrator bootstrapped for ${userId}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Platform administrator bootstrap failed'}\n`,
  );
  process.exitCode = 1;
});
