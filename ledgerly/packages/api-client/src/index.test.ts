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

  it('infers documented JSON response bodies', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: (() => Promise.resolve(new Response(JSON.stringify({ items: [{
        id: '10000000-0000-4000-8000-000000000001',
        version: 1,
        code: 'vat.cn-js.small-scale',
        name: '增值税规则',
        taxType: 'vat',
        jurisdictions: ['CN-JS'],
        description: '测试规则包',
        createdAt: '2026-10-08T00:00:00.000Z',
        createdBy: '20000000-0000-4000-8000-000000000002',
      }] }), {
        headers: { 'content-type': 'application/json' },
      }))) as typeof fetch,
    });

    const result = await client('/v1/rule-packages', { method: 'get' });

    expect(result.items[0]?.taxType).toBe('vat');
  });

  it('infers calculation decisions and financial report totals', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: ((input) => {
        const url = input instanceof Request ? input.url : input.toString();
        const payload = url.endsWith('/reports')
          ? { balanceSheet: { balanced: true, totalAssets: '100.00' } }
          : { status: 'decision_required', decision: { code: 'NO_MATCHING_RULE' } };
        return Promise.resolve(new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
        }));
      }) as typeof fetch,
    });
    const path = { companyId: '10000000-0000-4000-8000-000000000001' };

    const run = await client('/v1/companies/{companyId}/calculation-runs', {
      method: 'post', path,
      body: { taxType: 'vat', periodStart: '2026-10-01', periodEnd: '2026-12-31' },
    });
    const report = await client('/v1/companies/{companyId}/accounting/reports', {
      method: 'get', path,
    });

    expect(run.decision?.code).toBe('NO_MATCHING_RULE');
    expect(report.balanceSheet).toMatchObject({ balanced: true, totalAssets: '100.00' });
  });

  it('infers fact import requests and generated business event ids', async () => {
    const eventId = '20000000-0000-4000-8000-000000000002';
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: (() => Promise.resolve(new Response(JSON.stringify({
        status: 'confirmed', rows: [{ businessEventId: eventId }],
      }), { headers: { 'content-type': 'application/json' } }))) as typeof fetch,
    });

    const batch = await client('/v1/companies/{companyId}/imports/bank-csv', {
      method: 'post',
      path: { companyId: '10000000-0000-4000-8000-000000000001' },
      body: { fileName: 'bank.csv', content: 'date,description,amount',statementPeriodStart:'2026-10-01',statementPeriodEnd:'2026-10-31' },
    });

    expect(batch.rows[0]?.businessEventId).toBe(eventId);
  });

  it('infers onboarding profile requests and complete evaluation responses', async () => {
    const profile = {
      entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly',
      incomeTaxCollection: 'audit', industry: 'modern_service', hasInventory: false, hasBranches: false,
      hasImportExport: false, hasForeignCurrency: false, hasSpecialVatFivePercent: false,
      hasDifferenceTax: false, hasCrossRegionPrepayment: false, hasComplexPayroll: false,
      hasShareholderTransactions: false, hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
    } as const;
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: (() => Promise.resolve(new Response(JSON.stringify({
        decision: 'green', profile, nextAction: 'continue_setup',
      }), { headers: { 'content-type': 'application/json' } }))) as typeof fetch,
    });

    const evaluation = await client('/v1/companies/{companyId}/scope-evaluations', {
      method: 'post', path: { companyId: '10000000-0000-4000-8000-000000000001' }, body: profile,
    });

    expect(evaluation.profile.vatTaxpayerStatus).toBe('small_scale');
    expect(evaluation.nextAction).toBe('continue_setup');
  });

  it('infers reconciliation check snapshots and triage commands', async () => {
    const runId = '20000000-0000-4000-8000-000000000002';
    const issueId = '30000000-0000-4000-8000-000000000003';
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: ((input) => {
        const url = input instanceof Request ? input.url : input.toString();
        const payload = url.endsWith('/triage')
          ? { id: issueId, triageStatus: 'investigating', triageVersion: 2 }
          : { id: runId, grade: 'yellow', blocksFiling: true, totalIssues: 1, issues: [] };
        return Promise.resolve(new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }));
      }) as typeof fetch,
    });
    const path = { companyId: '10000000-0000-4000-8000-000000000001' };
    const run = await client('/v1/companies/{companyId}/reconciliation/check-runs', { method: 'post', path });
    const issue = await client('/v1/companies/{companyId}/reconciliation/check-runs/{runId}/issues/{issueId}/triage', {
      method: 'post', path: { ...path, runId, issueId },
      body: { status: 'investigating', note: '正在核对原始银行回单。', expectedVersion: 1 },
    });

    expect(run.blocksFiling).toBe(true);
    expect(issue.triageStatus).toBe('investigating');
  });
});
