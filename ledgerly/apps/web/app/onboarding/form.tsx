'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { useState, type FormEvent } from 'react';
import { bootstrapTenantSchema } from '@ledgerly/contracts';
import { useRouter } from 'next/navigation';

type SubmitState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'success'; companyId: string } | { kind: 'error'; message: string };

function fieldString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function OnboardingForm() {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const candidate = {
      tenantName: fieldString(form, 'tenantName'),
      company: {
        name: fieldString(form, 'companyName'),
        unifiedSocialCreditCode: fieldString(form, 'creditCode'),
        provinceCode: '32' as const,
        cityCode: fieldString(form, 'cityCode'),
      },
    };
    const parsed = bootstrapTenantSchema.safeParse(candidate);
    if (!parsed.success) {
      setState({ kind: 'error', message: '请检查企业名称、18 位统一社会信用代码和所在城市。' });
      return;
    }
    setState({ kind: 'pending' });
    try {
      const response = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/tenants/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': '10000000-0000-4000-8000-000000000001' },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== 'object' || payload === null || !('company' in payload)) {
        throw new Error('企业档案创建失败，请稍后重试。');
      }
      const company = (payload as { company: { id?: unknown } }).company;
      if (typeof company.id !== 'string') throw new Error('服务返回的数据不完整。');
      setState({ kind: 'success', companyId: company.id });
      const tenantId = (payload as { tenantId?: unknown }).tenantId;
      if (typeof tenantId !== 'string') throw new Error('服务返回的租户数据不完整。');
      window.localStorage.setItem('ledgerly.context', JSON.stringify({ tenantId, companyId: company.id }));
      window.localStorage.removeItem('ledgerly.scope');
      window.localStorage.removeItem('ledgerly.ledgerSetup');
      window.localStorage.removeItem('ledgerly.counterpartiesReady');
      router.push('/onboarding/profile');
    } catch (error: unknown) {
      const message = error instanceof TypeError
        ? '暂时无法连接后端服务，请确认本地 API 已启动。'
        : error instanceof Error
          ? error.message
          : '请求失败。';
      setState({ kind: 'error', message });
    }
  }

  return (
    <form className="onboarding-card" onSubmit={(event) => void submit(event)}>
      <label>工作空间名称<input name="tenantName" placeholder="例如：爱坤财务工作台" required maxLength={100} /></label>
      <label>企业全称<input name="companyName" placeholder="营业执照上的完整名称" required maxLength={200} /></label>
      <label>统一社会信用代码<input name="creditCode" inputMode="numeric" placeholder="18 位数字" required minLength={18} maxLength={18} /></label>
      <label>所在城市<select name="cityCode" defaultValue="3204"><option value="3201">南京市</option><option value="3202">无锡市</option><option value="3204">常州市</option><option value="3205">苏州市</option><option value="3206">南通市</option></select></label>
      <div className="notice">提交即创建草稿档案，尚不会生成账务或申报数据。</div>
      <button className="primary button" disabled={state.kind === 'pending'}>{state.kind === 'pending' ? '正在创建…' : '创建企业档案'}</button>
      {state.kind === 'error' && <p className="form-error" role="alert">{state.message}</p>}
      {state.kind === 'success' && <p className="form-success" role="status">创建成功，公司编号：{state.companyId}</p>}
    </form>
  );
}
