import { describe, expect, it } from 'vitest';
import { createApiClient } from './index.js';

describe('generated API client', () => {
  it('fills typed path parameters and sends JSON requests', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      defaultHeaders: { 'x-tenant-id': 'tenant-1' },
      fetch: ((input, init) => {
        capturedUrl = input instanceof Request ? input.url : input.toString();
        capturedBody = typeof init?.body === 'string' ? init.body : '';
        expect(new Headers(init?.headers).get('x-user-id')).toBe('actor-1');
        return Promise.resolve(new Response(JSON.stringify({ accepted: true }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }));
      }) as typeof fetch,
    });

    const payload = await client('/v1/tenants/bootstrap', {
      method: 'post',
      headers: { 'x-user-id': 'actor-1' },
      body: {
        tenantName: '测试租户',
        company: {
          name: '测试企业', unifiedSocialCreditCode: '913200001234567890',
          provinceCode: '32', cityCode: '3201',
        },
      },
    });

    expect(capturedUrl).toBe('https://api.example.test/v1/tenants/bootstrap');
    expect(JSON.parse(capturedBody)).toMatchObject({ tenantName: '测试租户' });
    expect(payload).toEqual({ accepted: true });
  });

  it('preserves structured error payloads', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: (() => Promise.resolve(new Response(JSON.stringify({ code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }))) as typeof fetch,
    });

    await expect(client('/v1/companies/{companyId}', {
      method: 'get',
      path: { companyId: '10000000-0000-4000-8000-000000000001' },
    })).rejects.toEqual(expect.objectContaining({
      status: 404,
      payload: { code: 'NOT_FOUND' },
    }));
  });
});
