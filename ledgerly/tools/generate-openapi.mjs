import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 30_991;
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: new URL('../apps/api/', import.meta.url),
  env: {
    ...process.env,
    API_PORT: String(port),
    AUTH_MODE: 'development-headers',
    NODE_ENV: 'development',
    STORAGE_MODE: 'memory',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let diagnostics = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => { diagnostics += chunk; });
child.stderr.on('data', (chunk) => { diagnostics += chunk; });

try {
  const document = await readDocument();
  await mkdir('openapi', { recursive: true });
  await writeFile('openapi/openapi.json', `${JSON.stringify(document, null, 2)}\n`, 'utf8');
} finally {
  child.kill('SIGTERM');
}

async function readDocument() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before OpenAPI generation completed.\n${diagnostics}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/docs-json`);
      if (response.ok) return await response.json();
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for the OpenAPI document.\n${diagnostics}`);
}
