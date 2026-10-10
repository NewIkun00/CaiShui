import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  loadAcceptanceEnvironment,
  publicConfiguration,
  validateAcceptanceEnvironment,
} from './lib/environment.mjs';
import { renderRealm } from './lib/realm.mjs';
import {
  acceptancePaths,
  commandAvailable,
  fileExists,
  readJson,
  run,
  spawnService,
  waitForHttp,
  writeJson,
} from './lib/runtime.mjs';

const rootDirectory = resolve(import.meta.dirname, '../..');
const paths = acceptancePaths(rootDirectory);
const command = process.argv[2] ?? 'doctor';

try {
  if (command === 'doctor') await doctor();
  else if (command === 'start') await start();
  else if (command === 'run') await acceptanceRun();
  else if (command === 'stop') await stop();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(
    JSON.stringify(
      { ok: false, command, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

async function doctor() {
  const loaded = await loadAcceptanceEnvironment(rootDirectory);
  const validation = validateAcceptanceEnvironment(loaded.values);
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const result = {
    ok: validation.errors.length === 0 && nodeMajor >= 22 && commandAvailable('docker'),
    node: { version: process.versions.node, supported: nodeMajor >= 22 },
    docker: { available: commandAvailable('docker') },
    environmentFile: loaded.envPath,
    environmentConfigured: validation.errors.length === 0,
    errors: validation.errors,
    configuration: publicConfiguration(loaded.values, validation.ports),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function start() {
  assertNode();
  if (!commandAvailable('docker'))
    throw new Error('Docker with Compose is required for the portable R5 acceptance stack');
  if (!commandAvailable('pnpm')) throw new Error('pnpm is required');
  const loaded = await loadAcceptanceEnvironment(rootDirectory);
  const validation = validateAcceptanceEnvironment(loaded.values);
  if (validation.errors.length) throw new Error(validation.errors.join('; '));
  const template = await readFile(paths.realmTemplate, 'utf8');
  const realm = renderRealm(template, loaded.values, validation.ports);
  await mkdir(dirname(paths.realm), { recursive: true });
  await writeFile(paths.realm, realm.rendered, { encoding: 'utf8', mode: 0o600, flush: true });

  const composeArgs = ['compose', '-f', paths.compose, '--env-file', loaded.envPath];
  await run('docker', [...composeArgs, 'up', '-d', '--remove-orphans'], {
    cwd: rootDirectory,
    env: loaded.values,
  });
  await waitForHttp(
    `http://127.0.0.1:${validation.ports.R5_KEYCLOAK_MANAGEMENT_PORT}/health/ready`,
    { timeoutMs: 180_000 },
  );
  await waitForHttp(`http://127.0.0.1:${validation.ports.R5_MAILPIT_HTTP_PORT}/api/v1/messages`, {
    timeoutMs: 60_000,
  });
  await run(process.execPath, [resolve(paths.tool, 'configure-keycloak.mjs')], {
    cwd: rootDirectory,
    env: { ...loaded.values, NODE_EXTRA_CA_CERTS: paths.ca },
  });

  const appEnvironment = applicationEnvironment(loaded.values, validation.ports);
  await run('pnpm', ['--filter', '@ledgerly/domain', 'build'], {
    cwd: rootDirectory,
    env: appEnvironment,
  });
  await run('pnpm', ['--filter', '@ledgerly/contracts', 'build'], {
    cwd: rootDirectory,
    env: appEnvironment,
  });
  await run('pnpm', ['db:migrate'], { cwd: rootDirectory, env: appEnvironment });

  const existing = (await fileExists(paths.pids)) ? await readJson(paths.pids) : {};
  const apiPid = alive(existing.apiPid)
    ? existing.apiPid
    : await spawnService('pnpm', ['--filter', '@ledgerly/api', 'dev'], {
        cwd: rootDirectory,
        env: appEnvironment,
        logPath: resolve(paths.data, 'logs/api.log'),
      });
  const webPid = alive(existing.webPid)
    ? existing.webPid
    : await spawnService(
        'pnpm',
        [
          '--filter',
          '@ledgerly/web',
          'exec',
          'next',
          'dev',
          '-p',
          String(validation.ports.R5_WEB_PORT),
        ],
        {
          cwd: rootDirectory,
          env: appEnvironment,
          logPath: resolve(paths.data, 'logs/web.log'),
        },
      );
  await writeJson(paths.pids, { apiPid, webPid, startedAt: new Date().toISOString() });
  await waitForHttp(`http://127.0.0.1:${validation.ports.R5_API_PORT}/docs-json`, {
    timeoutMs: 120_000,
  });
  await waitForHttp(`http://127.0.0.1:${validation.ports.R5_WEB_PORT}/login`, {
    timeoutMs: 120_000,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: 'start',
        pids: { apiPid, webPid },
        configuration: publicConfiguration(loaded.values, validation.ports),
      },
      null,
      2,
    ),
  );
}

async function acceptanceRun() {
  assertNode();
  const loaded = await loadAcceptanceEnvironment(rootDirectory);
  const validation = validateAcceptanceEnvironment(loaded.values);
  if (validation.errors.length) throw new Error(validation.errors.join('; '));
  if (!(await fileExists(paths.ca)))
    throw new Error('Acceptance CA is missing; run r5:acceptance:start first');
  await run(process.execPath, [resolve(paths.tool, 'smoke.mjs')], {
    cwd: rootDirectory,
    env: { ...loaded.values, NODE_EXTRA_CA_CERTS: paths.ca },
  });
}

async function stop() {
  const loaded = await loadAcceptanceEnvironment(rootDirectory);
  if (await fileExists(paths.pids)) {
    const pids = await readJson(paths.pids);
    for (const pid of [pids.apiPid, pids.webPid]) await terminate(pid);
  }
  if (commandAvailable('docker')) {
    const composeArgs = ['compose', '-f', paths.compose];
    if (await fileExists(loaded.envPath)) composeArgs.push('--env-file', loaded.envPath);
    await run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans'], {
      cwd: rootDirectory,
      env: {
        R5_POSTGRES_PASSWORD: 'unused-stop-value',
        R5_KEYCLOAK_DB_PASSWORD: 'unused-stop-value',
        R5_KEYCLOAK_ADMIN: 'unused-stop-value',
        R5_KEYCLOAK_ADMIN_PASSWORD: 'unused-stop-value',
        ...loaded.values,
      },
    });
  }
  await writeJson(paths.pids, { stoppedAt: new Date().toISOString() });
  console.log(JSON.stringify({ ok: true, command: 'stop' }, null, 2));
}

function applicationEnvironment(values, ports) {
  const databasePassword = encodeURIComponent(values.R5_POSTGRES_PASSWORD);
  return {
    ...process.env,
    ...values,
    NODE_ENV: 'development',
    STORAGE_MODE: 'postgres',
    AUTH_MODE: 'oidc',
    NEXT_PUBLIC_AUTH_MODE: 'oidc',
    DATABASE_URL: `postgresql://ledgerly:${databasePassword}@127.0.0.1:${ports.R5_POSTGRES_PORT}/ledgerly`,
    OIDC_ISSUER: `https://127.0.0.1:${ports.R5_KEYCLOAK_HTTPS_PORT}/realms/ledgerly`,
    OIDC_CLIENT_ID: 'ledgerly-web',
    OIDC_ADMIN_CLIENT_ID: 'ledgerly-session-revoker',
    OIDC_ADMIN_CLIENT_SECRET: values.R5_OIDC_ADMIN_CLIENT_SECRET,
    OIDC_REDIRECT_URI: `http://localhost:${ports.R5_WEB_PORT}/auth/callback`,
    AUTH_COOKIE_KEY: values.R5_AUTH_COOKIE_KEY,
    WEB_ORIGIN: `http://localhost:${ports.R5_WEB_PORT}`,
    API_INTERNAL_URL: `http://127.0.0.1:${ports.R5_API_PORT}`,
    API_PORT: String(ports.R5_API_PORT),
    NODE_EXTRA_CA_CERTS: paths.ca,
  };
}

function assertNode() {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error(`Node 22-24 is required; found ${process.versions.node}`);
}

function alive(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminate(pid) {
  if (!alive(pid)) return;
  if (process.platform === 'win32') await run('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
  else process.kill(-pid, 'SIGTERM');
}
