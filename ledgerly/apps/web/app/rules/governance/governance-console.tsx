'use client';

import {
  policySourceInputSchema,
  policySourceListResponseSchema,
  policySourceResponseSchema,
  rulePackageInputSchema,
  rulePackageListResponseSchema,
  rulePackageResponseSchema,
  ruleVersionInputSchema,
  ruleVersionListResponseSchema,
  ruleVersionResponseSchema,
  ruleVersionReviewSchema,
  type PolicySourceResponse,
  type RulePackageResponse,
  type RuleVersionResponse,
} from '@ledgerly/contracts';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

const defaultActorId = '10000000-0000-4000-8000-000000000001';
const statusNames: Record<string, string> = {
  draft: '草稿', technical_reviewed: '工程已复核', tax_reviewed: '财税已复核', tested: '测试已签署',
  approved: '已批准', scheduled: '待激活', active: '生效中', superseded: '已替代', withdrawn: '已撤回',
};
const taxTypeNames = { vat: '增值税', surcharge: '附加税费', corporate_income_tax: '企业所得税', stamp_duty: '印花税' } as const;

function api() { return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'; }
function authHeaders(actorId: string, json = false) { return { 'x-user-id': actorId, ...(json ? { 'content-type': 'application/json' } : {}) }; }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function versionToday() { return `${today().replaceAll('-', '.')}-1`; }
function field(form: FormData, name: string) { const value = form.get(name); return typeof value === 'string' ? value : ''; }
function csv(value: string) { return value.split(',').map((item) => item.trim()).filter(Boolean); }
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.replaceAll('\r\n', '\n').trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function errorMessage(response: Response, fallback: string) {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null) {
      const value = payload as { message?: unknown; error?: unknown };
      if (typeof value.message === 'string') return value.message;
      if (Array.isArray(value.message)) return value.message.join('；');
      if (typeof value.error === 'string') return value.error;
    }
  } catch { /* use stable fallback */ }
  return fallback;
}

export function GovernanceConsole() {
  const [actorId, setActorId] = useState(defaultActorId);
  const [sources, setSources] = useState<PolicySourceResponse[]>([]);
  const [packages, setPackages] = useState<RulePackageResponse[]>([]);
  const [versions, setVersions] = useState<RuleVersionResponse[]>([]);
  const [packageId, setPackageId] = useState('');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [activePanel, setActivePanel] = useState<'source' | 'package' | 'version'>('source');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const initialActor = window.localStorage.getItem('ledgerly.ruleActorId') ?? defaultActorId;
    setActorId(initialActor); void loadCatalog(initialActor).finally(() => setReady(true));
  }, []);

  async function loadCatalog(actor = actorId) {
    try {
      const [sourceResponse, packageResponse] = await Promise.all([
        fetch(`${api()}/v1/policy-sources`, { headers: authHeaders(actor) }),
        fetch(`${api()}/v1/rule-packages`, { headers: authHeaders(actor) }),
      ]);
      if (!sourceResponse.ok) throw new Error(await errorMessage(sourceResponse, '政策来源读取失败。'));
      if (!packageResponse.ok) throw new Error(await errorMessage(packageResponse, '规则包读取失败。'));
      setSources(policySourceListResponseSchema.parse(await sourceResponse.json()).items);
      setPackages(rulePackageListResponseSchema.parse(await packageResponse.json()).items);
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则目录读取失败。'); }
  }

  async function loadVersions(nextPackageId: string, actor = actorId) {
    setPackageId(nextPackageId); setVersions([]);
    if (!nextPackageId) return;
    setPending(true);
    try {
      const response = await fetch(`${api()}/v1/rule-packages/${nextPackageId}/versions`, { headers: authHeaders(actor) });
      if (!response.ok) throw new Error(await errorMessage(response, '规则版本读取失败。'));
      setVersions(ruleVersionListResponseSchema.parse(await response.json()).items);
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则版本读取失败。'); }
    finally { setPending(false); }
  }

  function applyActor() {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(actorId)) { setMessage('操作人 ID 必须是 UUID。'); return; }
    window.localStorage.setItem('ledgerly.ruleActorId', actorId); setMessage('操作人已更新。职责分离要求编辑人、工程复核人和财税复核人互不相同。');
    void loadCatalog(actorId); if (packageId) void loadVersions(packageId, actorId);
  }

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const snapshot = field(form, 'snapshot');
    if (snapshot.trim().length < 20) { setMessage('请粘贴至少 20 个字的官方政策快照文本，用于生成证据哈希。'); return; }
    const candidate = {
      documentNumber: field(form, 'documentNumber'), title: field(form, 'title'),
      officialUrl: field(form, 'officialUrl'), issuingAuthority: field(form, 'issuingAuthority'),
      publishedOn: field(form, 'publishedOn'), effectiveFrom: field(form, 'effectiveFrom'),
      ...(field(form, 'effectiveTo') ? { effectiveTo: field(form, 'effectiveTo') } : {}),
      summary: field(form, 'summary'), contentHash: await sha256(snapshot), lastVerifiedOn: field(form, 'lastVerifiedOn'),
    };
    const parsed = policySourceInputSchema.safeParse(candidate);
    if (!parsed.success) { setMessage(parsed.error.issues.map((item) => item.message).join('；')); return; }
    setPending(true); setMessage('正在固化官方政策来源…');
    try {
      const response = await fetch(`${api()}/v1/policy-sources`, { method: 'POST', headers: authHeaders(actorId, true), body: JSON.stringify(parsed.data) });
      if (!response.ok) throw new Error(await errorMessage(response, '政策来源登记失败。'));
      const saved = policySourceResponseSchema.parse(await response.json()); setSources((current) => [...current, saved]);
      formElement.reset(); setMessage(`政策来源已固化，内容哈希 ${saved.contentHash}。`); setActivePanel('package');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '政策来源登记失败。'); }
    finally { setPending(false); }
  }

  async function createPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const parsed = rulePackageInputSchema.safeParse({
      code: field(form, 'code'), name: field(form, 'name'), taxType: field(form, 'taxType'),
      jurisdictions: csv(field(form, 'jurisdictions')), description: field(form, 'description'),
    });
    if (!parsed.success) { setMessage(parsed.error.issues.map((item) => item.message).join('；')); return; }
    setPending(true); setMessage('正在创建稳定规则包…');
    try {
      const response = await fetch(`${api()}/v1/rule-packages`, { method: 'POST', headers: authHeaders(actorId, true), body: JSON.stringify(parsed.data) });
      if (!response.ok) throw new Error(await errorMessage(response, '规则包创建失败。'));
      const saved = rulePackageResponseSchema.parse(await response.json()); setPackages((current) => [...current, saved]); setPackageId(saved.id); setVersions([]);
      formElement.reset(); setMessage('规则包已创建，尚未包含可执行规则。'); setActivePanel('version');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则包创建失败。'); }
    finally { setPending(false); }
  }

  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!packageId) { setMessage('请先选择规则包。'); return; }
    const formElement = event.currentTarget; const form = new FormData(formElement); let parameters: unknown;
    try { parameters = JSON.parse(field(form, 'parameters') || '{}'); } catch { setMessage('参数必须是有效 JSON 对象。'); return; }
    const parsed = ruleVersionInputSchema.safeParse({
      versionTag: field(form, 'versionTag'), effectiveFrom: field(form, 'effectiveFrom'),
      ...(field(form, 'effectiveTo') ? { effectiveTo: field(form, 'effectiveTo') } : {}), sourceIds,
      applicability: { taxpayerStatuses: csv(field(form, 'taxpayerStatuses')), filingCycles: csv(field(form, 'filingCycles')), industries: csv(field(form, 'industries')), requiredTags: csv(field(form, 'requiredTags')), excludedTags: csv(field(form, 'excludedTags')) },
      calculationImplementation: field(form, 'calculationImplementation'), parameters,
      explanation: field(form, 'explanation'),
    });
    if (!parsed.success) { setMessage(parsed.error.issues.map((item) => item.message).join('；')); return; }
    setPending(true); setMessage('正在创建不可执行的规则草稿…');
    try {
      const response = await fetch(`${api()}/v1/rule-packages/${packageId}/versions`, { method: 'POST', headers: authHeaders(actorId, true), body: JSON.stringify(parsed.data) });
      if (!response.ok) throw new Error(await errorMessage(response, '规则草稿创建失败。'));
      const saved = ruleVersionResponseSchema.parse(await response.json()); setVersions((current) => [...current, saved]);
      formElement.reset(); setSourceIds([]); setMessage('规则草稿已创建。请切换到不同操作人完成工程复核。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则草稿创建失败。'); }
    finally { setPending(false); }
  }

  async function review(version: RuleVersionResponse, kind: 'technical' | 'tax') {
    if (!packageId) return; const note = reviewNotes[version.id] ?? '';
    const parsed = ruleVersionReviewSchema.safeParse({ kind, expectedVersion: version.recordVersion, note });
    if (!parsed.success) { setMessage('复核说明至少 5 个字，并应写明检查范围和结论。'); return; }
    setPending(true); setMessage(kind === 'technical' ? '正在提交工程复核…' : '正在提交财税复核…');
    try {
      const response = await fetch(`${api()}/v1/rule-packages/${packageId}/versions/${version.id}/reviews`, { method: 'POST', headers: authHeaders(actorId, true), body: JSON.stringify(parsed.data) });
      if (!response.ok) throw new Error(await errorMessage(response, '规则复核失败。'));
      const saved = ruleVersionResponseSchema.parse(await response.json()); setVersions((current) => current.map((item) => item.id === saved.id ? saved : item));
      setReviewNotes((current) => ({ ...current, [version.id]: '' }));
      setMessage(kind === 'technical' ? '工程复核完成，请再切换一名独立财税复核人。' : '财税复核完成，现在可以进入黄金样本工作台。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则复核失败。'); }
    finally { setPending(false); }
  }

  if (!ready) return <section className="governance-shell"><div className="onboarding-card">正在读取规则治理目录…</div></section>;
  return <section className="governance-shell">
    <div className="governance-identity"><div><p className="eyebrow">开发态职责分离</p><strong>当前操作人</strong><span>编辑、工程复核、财税复核必须使用不同 UUID。</span></div><input aria-label="开发态操作人 UUID" value={actorId} onChange={(event) => setActorId(event.target.value)} /><button type="button" className="secondary" onClick={applyActor} disabled={pending}>应用操作人</button></div>
    <nav className="governance-steps"><button className={activePanel === 'source' ? 'active' : ''} onClick={() => setActivePanel('source')}>1 官方政策来源 <b>{sources.length}</b></button><button className={activePanel === 'package' ? 'active' : ''} onClick={() => setActivePanel('package')}>2 稳定规则包 <b>{packages.length}</b></button><button className={activePanel === 'version' ? 'active' : ''} onClick={() => setActivePanel('version')}>3 草稿与双重复核 <b>{versions.length}</b></button></nav>

    {activePanel === 'source' && <div className="governance-grid"><form className="onboarding-card governance-form" onSubmit={(event) => void createSource(event)}><h2>登记官方政策快照</h2><label>文号<input name="documentNumber" required maxLength={200} /></label><label>政策标题<input name="title" required maxLength={300} /></label><label>官方 gov.cn HTTPS 链接<input name="officialUrl" type="url" required placeholder="https://...gov.cn/..." /></label><label>发布机关<input name="issuingAuthority" required maxLength={200} /></label><div className="governance-dates"><label>发布日<input name="publishedOn" type="date" required /></label><label>生效日<input name="effectiveFrom" type="date" required /></label><label>失效日（可选）<input name="effectiveTo" type="date" /></label></div><label>适用摘要<textarea name="summary" rows={3} required maxLength={2000} /></label><label>官方正文快照<textarea name="snapshot" rows={8} required placeholder="粘贴已核验的官方正文。系统只保存 SHA-256 哈希，用于检测内容变化。" /></label><label>末次核验日<input name="lastVerifiedOn" type="date" required defaultValue={today()} /></label><button className="primary button" disabled={pending}>固化政策来源</button></form><Catalog title="已登记来源" empty="尚无已核验官方来源。">{sources.map((source) => <article key={source.id}><strong>{source.title}</strong><span>{source.documentNumber} · {source.issuingAuthority}</span><small>有效 {source.effectiveFrom} 起 · 核验于 {source.lastVerifiedOn}</small><a href={source.officialUrl} target="_blank" rel="noreferrer">查看官方来源</a><code>{source.contentHash}</code></article>)}</Catalog></div>}

    {activePanel === 'package' && <div className="governance-grid"><form className="onboarding-card governance-form" onSubmit={(event) => void createPackage(event)}><h2>创建稳定规则包</h2><label>稳定编码<input name="code" required placeholder="vat.cn-js.small-scale" /></label><label>规则包名称<input name="name" required /></label><label>税种<select name="taxType" defaultValue="vat">{Object.entries(taxTypeNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>适用区域<input name="jurisdictions" required defaultValue="CN" placeholder="CN,CN-JS" /><small>多个编码使用英文逗号分隔。</small></label><label>边界说明<textarea name="description" rows={5} required placeholder="说明该规则包解决的问题和明确不适用范围。" /></label><button className="primary button" disabled={pending}>创建规则包</button></form><Catalog title="规则包目录" empty="尚无规则包。">{packages.map((item) => <button type="button" className={packageId === item.id ? 'selected' : ''} key={item.id} onClick={() => { setActivePanel('version'); void loadVersions(item.id); }}><strong>{item.name}</strong><span>{taxTypeNames[item.taxType]} · {item.jurisdictions.join(' / ')}</span><small>{item.description}</small><code>{item.code}</code></button>)}</Catalog></div>}

    {activePanel === 'version' && <><div className="version-package-selector"><label>当前规则包<select value={packageId} onChange={(event) => void loadVersions(event.target.value)}><option value="">请选择</option>{packages.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.code}</option>)}</select></label><span>草稿不会自动执行；只有完成职责分离和黄金样本验证后才能进入发布。</span></div><div className="governance-grid version-grid"><form className="onboarding-card governance-form" onSubmit={(event) => void createVersion(event)}><h2>创建规则草稿</h2><label>版本标识<input name="versionTag" required defaultValue={versionToday()} /></label><div className="governance-dates two"><label>生效日<input name="effectiveFrom" type="date" required defaultValue={today()} /></label><label>失效日（可选）<input name="effectiveTo" type="date" /></label></div><fieldset><legend>政策来源（至少一项）</legend>{sources.length === 0 ? <span>请先登记官方政策来源。</span> : sources.map((source) => <label className="source-check" key={source.id}><input type="checkbox" checked={sourceIds.includes(source.id)} onChange={(event) => setSourceIds((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))} /><span>{source.documentNumber}<small>{source.title}</small></span></label>)}</fieldset><label>计算实现键<input name="calculationImplementation" required placeholder="vat-small-scale-v1" /><small>必须引用版本化纯函数；此处不填写公式。</small></label><label>纳税人身份<input name="taxpayerStatuses" required placeholder="small_scale" /></label><label>申报周期<input name="filingCycles" required placeholder="quarterly" /></label><label>行业标识<input name="industries" required placeholder="modern_service" /></label><label>必备标签<input name="requiredTags" placeholder="可留空，多项用逗号分隔" /></label><label>排除标签<input name="excludedTags" placeholder="可留空，多项用逗号分隔" /></label><label>参数 JSON<textarea name="parameters" rows={4} defaultValue="{}" required /><small>未获专业签审前保持空对象，禁止试猜税率。</small></label><label>规则解释<textarea name="explanation" rows={5} required placeholder="说明政策依据、适用范围、失败和转人工边界。" /></label><button className="primary button" disabled={pending || !packageId || sources.length === 0}>创建不可执行草稿</button></form><Catalog title="版本与复核轨迹" empty={packageId ? '该规则包尚无版本。' : '请先选择规则包。'}>{versions.map((version) => <article className="version-card" key={version.id}><header><div><strong>{version.versionTag}</strong><code>{version.calculationImplementation}</code></div><span className={`rule-status ${version.status}`}>{statusNames[version.status]}</span></header><small>编辑人 {version.createdBy}</small>{version.technicalReviewedBy && <small>工程复核 {version.technicalReviewedBy}</small>}{version.taxReviewedBy && <small>财税复核 {version.taxReviewedBy}</small>}<p>{version.explanation}</p>{(version.status === 'draft' || version.status === 'technical_reviewed') && <div className="review-box"><textarea rows={2} value={reviewNotes[version.id] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [version.id]: event.target.value }))} placeholder="写明复核范围、证据和结论（至少 5 个字）" /><button type="button" className="secondary" disabled={pending} onClick={() => void review(version, version.status === 'draft' ? 'technical' : 'tax')}>{version.status === 'draft' ? '完成工程复核' : '完成财税复核'}</button></div>}{version.status === 'tax_reviewed' && <Link className="setup-action" href="/rules">进入黄金样本工作台</Link>}<details><summary>查看哈希与适用性</summary><code>{version.contentHash}</code><pre>{JSON.stringify(version.applicability, null, 2)}</pre></details></article>)}</Catalog></div></>}
    {message && <p className={message.includes('失败') || message.includes('必须') || message.includes('禁止') ? 'form-error governance-message' : 'form-success governance-message'} role="status">{message}</p>}
  </section>;
}

function Catalog({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="governance-catalog"><h2>{title}</h2>{hasChildren ? children : <p className="rule-empty">{empty}</p>}</section>;
}
