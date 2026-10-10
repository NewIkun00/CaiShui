export class CookieClient {
  #cookies = new Map();

  async fetch(url, init = {}) {
    const headers = new Headers(init.headers);
    const cookie = [...this.#cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookie) headers.set('cookie', cookie);
    const response = await fetch(url, { ...init, headers, redirect: init.redirect ?? 'manual' });
    for (const value of response.headers.getSetCookie()) this.#store(value);
    return response;
  }

  value(name) {
    return this.#cookies.get(name);
  }

  set(name, value) {
    if (value) this.#cookies.set(name, value);
    else this.#cookies.delete(name);
  }

  #store(header) {
    const [pair, ...attributes] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator < 1) return;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = attributes.some((item) => /^\s*max-age=0\s*$/iu.test(item));
    if (expired || !value) this.#cookies.delete(name);
    else this.#cookies.set(name, value);
  }
}

export async function jsonRequest(client, url, { method = 'GET', body, headers, expected } = {}) {
  const response = await client.fetch(url, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let document;
  try {
    document = text ? JSON.parse(text) : undefined;
  } catch {
    document = { text };
  }
  if (expected !== undefined && response.status !== expected) {
    throw new Error(
      `${method} ${url} returned ${response.status}, expected ${expected}: ${JSON.stringify(document)}`,
    );
  }
  return { response, document };
}
