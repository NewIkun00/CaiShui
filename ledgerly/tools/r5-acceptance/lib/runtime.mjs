import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { redact } from './redaction.mjs';

export function commandName(name) {
  return process.platform === 'win32' && ['npm', 'npx', 'pnpm', 'yarn'].includes(name)
    ? `${name}.cmd`
    : name;
}

export function commandInvocation(name, args) {
  const command = commandName(name);
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) return { command, args };
  const commandLine = [command, ...args].map(quoteWindowsCommandArgument).join(' ');
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${commandLine}"`],
    windowsVerbatimArguments: true,
  };
}

export function commandAvailable(name) {
  const probe = process.platform === 'win32' ? ['where', name] : ['sh', '-c', `command -v ${name}`];
  return spawnSync(probe[0], probe.slice(1), { stdio: 'ignore' }).status === 0;
}

export async function run(name, args, options = {}) {
  return new Promise((accept, reject) => {
    const invocation = commandInvocation(name, args);
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'inherit',
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error(`${name} exited with code ${code}`)),
    );
  });
}

export async function spawnService(name, args, { cwd, env, logPath }) {
  await mkdir(dirname(logPath), { recursive: true });
  const { openSync } = await import('node:fs');
  const output = openSync(logPath, 'a');
  const invocation = commandInvocation(name, args);
  const child = spawn(invocation.command, invocation.args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', output, output],
    shell: false,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  child.unref();
  return child.pid;
}

function quoteWindowsCommandArgument(value) {
  const text = String(value);
  if (/[\0\r\n"]/u.test(text)) throw new Error('Unsafe character in Windows command argument');
  return `"${text.replaceAll('%', '%%')}"`;
}

export async function waitForHttp(url, { timeoutMs = 120_000, expectedStatus = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.status === expectedStatus) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((accept) => setTimeout(accept, 1_000));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}`);
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(redact(value), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function acceptancePaths(rootDirectory) {
  const tool = resolve(rootDirectory, 'tools/r5-acceptance');
  const data = resolve(tool, '.data');
  return {
    tool,
    data,
    compose: resolve(tool, 'compose.yml'),
    realmTemplate: resolve(tool, 'keycloak/realm.template.json'),
    realm: resolve(data, 'realm/ledgerly-realm.json'),
    ca: resolve(data, 'certs/ca.crt'),
    pids: resolve(data, 'pids.json'),
    reports: resolve(data, 'reports'),
  };
}
