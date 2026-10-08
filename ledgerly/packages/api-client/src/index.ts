import type { paths } from './generated.js';

export type { paths, operations } from './generated.js';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Operation<Path extends keyof paths, Method extends HttpMethod> = Method extends keyof paths[Path]
  ? NonNullable<paths[Path][Method]>
  : never;
type ParametersOf<Op, Location extends 'path' | 'query'> = Op extends {
  parameters: Record<Location, infer Parameters>;
} ? Parameters : never;
type BodyOf<Op> = Op extends {
  requestBody: { content: { 'application/json': infer Body } };
} ? Body : never;
type SuccessStatus = 200 | 201 | 202 | 204;
type JsonContent<Response> = Response extends {
  content: { 'application/json': infer Payload };
} ? Payload : unknown;
type ResponseOf<Op> = Op extends { responses: infer Responses }
  ? JsonContent<Responses[Extract<keyof Responses, SuccessStatus>]>
  : unknown;

export type ApiRequestOptions<Path extends keyof paths, Method extends HttpMethod> = {
  readonly method: Method;
  readonly path?: ParametersOf<Operation<Path, Method>, 'path'>;
  readonly query?: ParametersOf<Operation<Path, Method>, 'query'>;
  readonly body?: BodyOf<Operation<Path, Method>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
};

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiClientError';
  }
}

export function createApiClient(options: ApiClientOptions) {
  const requestFetch = options.fetch ?? globalThis.fetch;
  return async function request<Path extends keyof paths, Method extends HttpMethod>(
    pathTemplate: Path,
    requestOptions: ApiRequestOptions<Path, Method>,
  ): Promise<ResponseOf<Operation<Path, Method>>> {
    let path = String(pathTemplate);
    for (const [key, value] of Object.entries(requestOptions.path ?? {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(serializeParameter(value)));
    }
    const url = new URL(path, ensureTrailingSlash(options.baseUrl));
    for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, serializeParameter(value));
    }
    const response = await requestFetch(url, {
      method: requestOptions.method.toUpperCase(),
      headers: {
        ...options.defaultHeaders,
        ...requestOptions.headers,
        ...(requestOptions.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(requestOptions.body === undefined ? {} : { body: JSON.stringify(requestOptions.body) }),
      ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal }),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = response.status === 204
      ? undefined
      : contentType.includes('application/json')
        ? await response.json()
        : await response.arrayBuffer();
    if (!response.ok) throw new ApiClientError(response.status, payload);
    return payload as ResponseOf<Operation<Path, Method>>;
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function serializeParameter(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  return JSON.stringify(value) ?? '';
}
