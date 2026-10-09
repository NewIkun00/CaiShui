'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { companyProfileSchema, scopeEvaluationSchema, type ScopeEvaluationResponse } from '@ledgerly/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
type ViewState =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; result: ScopeEvaluationResponse };

const riskQuestions = [
  ['hasInventory', '有需要核算的商品或原材料存货'],
  ['hasBranches', '设有分公司或其他分支机构'],
  ['hasImportExport', '有进出口业务'],
  ['hasForeignCurrency', '收付或持有外币'],
  ['hasSpecialVatFivePercent', '有适用 5% 征收率的业务'],
  ['hasDifferenceTax', '有差额征税业务'],
  ['hasCrossRegionPrepayment', '有跨地区预缴税款'],
  ['hasComplexPayroll', '有多员工或复杂薪酬'],
  ['hasShareholderTransactions', '有股东借款、垫付或其他股东往来'],
  ['hasComplexTaxAdjustments', '存在复杂纳税调整'],
] as const;

function readContext(): WorkspaceContext | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof value !== 'object' || value === null) return null;
    const candidate = value as Partial<WorkspaceContext>;
    return typeof candidate.tenantId === 'string' && typeof candidate.companyId === 'string'
      ? { tenantId: candidate.tenantId, companyId: candidate.companyId }
      : null;
  } catch { return null; }
}

export function ProfileForm() {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ViewState>({ kind: 'form' });

  useEffect(() => {
    setContext(readContext());
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem('ledgerly.scope') ?? 'null');
      const parsed = scopeEvaluationSchema.safeParse(saved);
      if (parsed.success) setState({ kind: 'result', result: parsed.data });
    } catch { /* A malformed preview cache is ignored. */ }
    setReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) return;
    const form = new FormData(event.currentTarget);
    const checked = (name: string) => form.get(name) === 'on';
    const input = {
      entityType: form.get('entityType'),
      vatTaxpayerStatus: form.get('vatTaxpayerStatus'),
      vatFilingCycle: form.get('vatFilingCycle'),
      incomeTaxCollection: form.get('incomeTaxCollection'),
      industry: form.get('industry'),
      ...Object.fromEntries(riskQuestions.map(([name]) => [name, checked(name)])),
      sourceDocumentsComplete: checked('sourceDocumentsComplete'),
    };
    const parsed = companyProfileSchema.safeParse(input);
    if (!parsed.success) { setState({ kind: 'error', message: '请完成所有必填问题。' }); return; }
    setState({ kind: 'submitting' });
    try {
      const response = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/companies/${context.companyId}/scope-evaluations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '10000000-0000-4000-8000-000000000001',
          'x-tenant-id': context.tenantId,
        },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('适用性判断失败，请稍后重试。');
      const result = scopeEvaluationSchema.parse(payload);
      window.localStorage.setItem('ledgerly.scope', JSON.stringify(result));
      setState({ kind: 'result', result });
    } catch (error: unknown) {
      setState({ kind: 'error', message: error instanceof TypeError ? '无法连接后端服务。' : error instanceof Error ? error.message : '请求失败。' });
    }
  }

  if (!ready) return <div className="onboarding-card">正在读取企业档案…</div>;
  if (!context) return <div className="onboarding-card"><p>没有找到刚创建的企业档案。</p><Link className="primary" href="/onboarding">重新建立档案</Link></div>;
  if (state.kind === 'result') return <ScopeResult result={state.result} />;

  return (
    <form className="onboarding-card profile-form" onSubmit={(event) => void submit(event)}>
      <fieldset><legend>税务与主体身份</legend>
        <label>营业执照主体<select name="entityType" defaultValue="one_person_llc"><option value="one_person_llc">一人有限责任公司</option><option value="other">其他主体</option></select></label>
        <label>增值税纳税人身份<select name="vatTaxpayerStatus" defaultValue="small_scale"><option value="small_scale">小规模纳税人</option><option value="general">一般纳税人</option></select></label>
        <label>增值税申报周期<select name="vatFilingCycle" defaultValue="quarterly"><option value="quarterly">按季申报</option><option value="monthly">按月申报</option></select></label>
        <label>企业所得税征收方式<select name="incomeTaxCollection" defaultValue="audit"><option value="audit">查账征收</option><option value="assessed">核定征收</option></select></label>
        <label>主营业务<select name="industry" defaultValue="modern_service"><option value="modern_service">设计、开发、咨询等现代服务</option><option value="other">其他行业</option></select></label>
      </fieldset>
      <fieldset><legend>复杂业务排查</legend><p className="field-help">符合的情况请勾选；不确定时先勾选，后续由人工复核。</p>
        <div className="check-grid">{riskQuestions.map(([name, label]) => <label className="check" key={name}><input type="checkbox" name={name} /> <span>{label}</span></label>)}</div>
      </fieldset>
      <label className="check confirm"><input type="checkbox" name="sourceDocumentsComplete" defaultChecked /> <span>营业执照、税种认定等基础资料完整，以上回答已核对</span></label>
      <button className="primary button" disabled={state.kind === 'submitting'}>{state.kind === 'submitting' ? '正在判断…' : '生成适用性结论'}</button>
      {state.kind === 'error' && <p className="form-error" role="alert">{state.message}</p>}
    </form>
  );
}

function ScopeResult({ result }: { result: ScopeEvaluationResponse }) {
  const content = {
    green: ['适合继续自助建账', '当前画像在 V1 自动化范围内。下一步可以初始化账套。'],
    yellow: ['需要人工复核', '请先处理下列事项，复核通过前不会生成可申报状态。'],
    red: ['超出 V1 自动化范围', '系统不会继续自动计算，请根据问题清单寻求合规专业服务。'],
  }[result.decision];
  function reset(): void {
    window.localStorage.removeItem('ledgerly.scope');
    window.location.reload();
  }
  return <section className={`scope-result ${result.decision}`}><span className="decision-dot" /><p className="eyebrow">适用性结论</p><h2>{content[0]}</h2><p>{content[1]}</p>{result.reasons.length > 0 && <ul>{result.reasons.map((reason) => <li key={reason.code}>{reason.message}<small>{reason.code}</small></li>)}</ul>}<div className="result-actions">{result.decision === 'green' && <Link className="primary" href="/dashboard">进入初始化工作台</Link>}<button className="secondary" type="button" onClick={reset}>重新填写</button></div></section>;
}
