'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import {
  goldenFixtureExecutionResponseSchema,
  goldenFixtureSetInputSchema,
  goldenFixtureSetListResponseSchema,
  rulePackageListResponseSchema,
  ruleShadowRunCreationResponseSchema,
  ruleShadowRunListResponseSchema,
  ruleTestEvidenceSchema,
  ruleVersionListResponseSchema,
  ruleVersionResponseSchema,
  type GoldenFixtureExecutionResponse,
  type GoldenFixtureSetResponse,
  type RulePackageResponse,
  type RuleShadowRunResponse,
  type RuleVersionResponse,
} from '@ledgerly/contracts';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

const defaultActorId = '10000000-0000-4000-8000-000000000001';
const scenarios = ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception'] as const;
const scenarioNames: Record<(typeof scenarios)[number], string> = {
  normal: '正常', boundary: '边界', cross_period: '跨期', red_invoice: '红字', correction: '更正', exception: '不适用/异常',
};
const statusNames: Record<string, string> = {
  draft: '草稿', technical_reviewed: '工程已复核', tax_reviewed: '财税已复核', tested: '测试已签署',
  approved: '已批准', scheduled: '待激活', active: '生效中', superseded: '已替代', withdrawn: '已撤回',
};
const shadowStatusNames: Record<string, string> = {
  identical: '完全一致', differences_found: '发现差异', execution_failed: '存在执行失败',
  output_changed: '输出变化', steps_changed: '步骤变化', output_and_steps_changed: '输出和步骤变化',
  baseline_failed: '基准执行失败', candidate_failed: '候选执行失败', both_failed: '两侧均失败',
};

function fixtureTemplate() {
  return JSON.stringify(scenarios.map((scenario, index) => ({
    caseId: `${scenario.replace('_', '-')}-${index + 1}`,
    scenario,
    input: { '请替换': '脱敏后的业务事实与适用性条件' },
    expected: { '请替换': '专业人员签审的预期输出及舍入结果' },
    explanation: `请替换：${scenarioNames[scenario]}场景的官方依据、计算步骤和边界。`,
  })), null, 2);
}

function api() { return process.env.NEXT_PUBLIC_API_URL ?? '/api'; }
function suggestedVersion() {
  return `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '.')}-1`;
}
function headers(actorId: string, json = false) {
  return { 'x-user-id': actorId, ...(json ? { 'content-type': 'application/json' } : {}) };
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
  } catch { /* keep the stable fallback */ }
  return fallback;
}

export function FixtureWorkbench() {
  const [actorId, setActorId] = useState(defaultActorId);
  const [packages, setPackages] = useState<RulePackageResponse[]>([]);
  const [versions, setVersions] = useState<RuleVersionResponse[]>([]);
  const [fixtureSets, setFixtureSets] = useState<GoldenFixtureSetResponse[]>([]);
  const [shadowRuns, setShadowRuns] = useState<RuleShadowRunResponse[]>([]);
  const [packageId, setPackageId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [fixtureSetId, setFixtureSetId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [fixtureSetVersion, setFixtureSetVersion] = useState(suggestedVersion);
  const [professionalNote, setProfessionalNote] = useState('');
  const [redactionAttested, setRedactionAttested] = useState(false);
  const [fixturesText, setFixturesText] = useState(fixtureTemplate);
  const [execution, setExecution] = useState<GoldenFixtureExecutionResponse | null>(null);
  const [testEvidenceNote, setTestEvidenceNote] = useState('');
  const [selectedShadow, setSelectedShadow] = useState<RuleShadowRunResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');

  const currentVersion = versions.find((item) => item.id === versionId);
  const selectedFixture = fixtureSets.find((item) => item.id === fixtureSetId);
  const canSign = currentVersion?.status === 'tax_reviewed' && currentVersion.taxReviewedBy === actorId;
  const scenarioCoverage = useMemo(() => {
    try {
      const value: unknown = JSON.parse(fixturesText);
      if (!Array.isArray(value)) return [];
      return scenarios.filter((scenario) => value.some((item) => typeof item === 'object' && item !== null && (item as { scenario?: unknown }).scenario === scenario));
    } catch { return []; }
  }, [fixturesText]);

  useEffect(() => {
    const saved = window.localStorage.getItem('ledgerly.ruleActorId');
    const initialActor = saved ?? defaultActorId;
    setActorId(initialActor);
    void loadPackages(initialActor).finally(() => setReady(true));
  }, []);

  async function loadPackages(actor = actorId) {
    setMessage('');
    try {
      const response = await apiFetch(`${api()}/v1/rule-packages`, { headers: headers(actor) });
      if (!response.ok) throw new Error(await errorMessage(response, '规则包读取失败。'));
      const result = rulePackageListResponseSchema.parse(await response.json());
      setPackages(result.items);
      if (result.items.length === 0) setMessage('尚无规则包，请先由规则管理员在 API 中登记官方政策来源、规则包和草稿版本。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则包读取失败。'); }
  }

  async function selectPackage(nextPackageId: string) {
    setPackageId(nextPackageId); setVersionId(''); setFixtureSets([]); setFixtureSetId(''); setExecution(null); setSelectedShadow(null);
    if (!nextPackageId) { setVersions([]); setShadowRuns([]); return; }
    setPending(true); setMessage('正在读取规则版本…');
    try {
      const [versionResponse, shadowResponse] = await Promise.all([
        apiFetch(`${api()}/v1/rule-packages/${nextPackageId}/versions`, { headers: headers(actorId) }),
        apiFetch(`${api()}/v1/rule-packages/${nextPackageId}/shadow-runs`, { headers: headers(actorId) }),
      ]);
      if (!versionResponse.ok) throw new Error(await errorMessage(versionResponse, '规则版本读取失败。'));
      if (!shadowResponse.ok) throw new Error(await errorMessage(shadowResponse, '影子记录读取失败。'));
      const versionResult = ruleVersionListResponseSchema.parse(await versionResponse.json());
      const shadowResult = ruleShadowRunListResponseSchema.parse(await shadowResponse.json());
      setVersions(versionResult.items); setShadowRuns(shadowResult.items);
      setBaselineId(versionResult.items.find((item) => item.status === 'active')?.id ?? versionResult.items[0]?.id ?? '');
      setCandidateId(versionResult.items.find((item) => item.status === 'tax_reviewed')?.id ?? versionResult.items[1]?.id ?? '');
      setMessage(versionResult.items.length ? '' : '该规则包还没有版本。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '规则版本读取失败。'); }
    finally { setPending(false); }
  }

  async function selectVersion(nextVersionId: string) {
    setVersionId(nextVersionId); setFixtureSetId(''); setExecution(null); setTestEvidenceNote('');
    if (!packageId || !nextVersionId) { setFixtureSets([]); return; }
    setPending(true); setMessage('正在读取签审样本…');
    try {
      const response = await apiFetch(`${api()}/v1/rule-packages/${packageId}/versions/${nextVersionId}/fixture-sets`, { headers: headers(actorId) });
      if (!response.ok) throw new Error(await errorMessage(response, '样本集读取失败。'));
      const result = goldenFixtureSetListResponseSchema.parse(await response.json());
      setFixtureSets(result.items); setFixtureSetId(result.items.at(-1)?.id ?? ''); setMessage('');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '样本集读取失败。'); }
    finally { setPending(false); }
  }

  function saveActor() {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(actorId)) { setMessage('操作人 ID 必须是 UUID。'); return; }
    window.localStorage.setItem('ledgerly.ruleActorId', actorId);
    setMessage('开发态操作人已更新；请重新选择规则版本。');
    void loadPackages(actorId);
  }

  async function submitFixtureSet(event: FormEvent) {
    event.preventDefault();
    if (!packageId || !versionId) { setMessage('请先选择规则包和财税已复核版本。'); return; }
    if (fixturesText.includes('请替换')) { setMessage('模板中仍有“请替换”占位内容，禁止将模板当作真实样本签署。'); return; }
    let fixtures: unknown;
    try { fixtures = JSON.parse(fixturesText); } catch { setMessage('样本 JSON 格式无效。'); return; }
    const parsed = goldenFixtureSetInputSchema.safeParse({ fixtureSetVersion, redactionAttested, professionalNote, fixtures });
    if (!parsed.success) { setMessage(parsed.error.issues.map((item) => item.message).join('；')); return; }
    setPending(true); setMessage('正在固化并签署样本集…');
    try {
      const response = await apiFetch(`${api()}/v1/rule-packages/${packageId}/versions/${versionId}/fixture-sets`, {
        method: 'POST', headers: headers(actorId, true), body: JSON.stringify(parsed.data),
      });
      if (!response.ok) throw new Error(await errorMessage(response, '样本签署失败。'));
      await selectVersion(versionId); setMessage('黄金样本集已脱敏声明并不可变签署。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '样本签署失败。'); }
    finally { setPending(false); }
  }

  async function executeFixtures() {
    if (!packageId || !versionId || !fixtureSetId) return;
    setPending(true); setMessage('正在逐例执行版本化实现…');
    try {
      const response = await apiFetch(`${api()}/v1/rule-packages/${packageId}/versions/${versionId}/fixture-sets/${fixtureSetId}/executions`, { method: 'POST', headers: headers(actorId, true), body: '{}' });
      if (!response.ok) throw new Error(await errorMessage(response, '样本执行失败。'));
      const result = goldenFixtureExecutionResponseSchema.parse(await response.json()); setExecution(result);
      setMessage(result.status === 'passed' ? '全部样本通过，已保存不可变证据。' : '存在未通过样本，不得发布该规则。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '样本执行失败。'); }
    finally { setPending(false); }
  }

  async function signTestEvidence() {
    if (!packageId || !versionId || !currentVersion || !selectedFixture || !execution || execution.status !== 'passed') return;
    const coveredScenarios = [...new Set(selectedFixture.fixtures.map((item) => item.scenario))];
    const parsed = ruleTestEvidenceSchema.safeParse({
      expectedVersion: currentVersion.recordVersion, fixtureSetVersion: selectedFixture.fixtureSetVersion,
      totalFixtures: execution.totalFixtures, passedFixtures: execution.passedFixtures,
      coveredScenarios, artifactHash: execution.artifactHash, note: testEvidenceNote,
    });
    if (!parsed.success) { setMessage('请填写至少 5 个字的测试签署结论。'); return; }
    setPending(true); setMessage('正在签署全量黄金样本测试证据…');
    try {
      const response = await apiFetch(`${api()}/v1/rule-packages/${packageId}/versions/${versionId}/test-evidence`, {
        method: 'POST', headers: headers(actorId, true), body: JSON.stringify(parsed.data),
      });
      if (!response.ok) throw new Error(await errorMessage(response, '测试证据签署失败。'));
      const saved = ruleVersionResponseSchema.parse(await response.json());
      setVersions((current) => current.map((item) => item.id === saved.id ? saved : item));
      setTestEvidenceNote(''); setMessage('全量样本证据已由财税复核人签署，规则可进入独立审批。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '测试证据签署失败。'); }
    finally { setPending(false); }
  }

  async function executeShadow() {
    if (!packageId || !baselineId || !candidateId || !fixtureSetId) { setMessage('请选择基准版本、候选版本和样本集。'); return; }
    setPending(true); setMessage('正在对同一签审样本执行新旧版本对比…');
    try {
      const response = await apiFetch(`${api()}/v1/rule-packages/${packageId}/shadow-runs`, {
        method: 'POST', headers: headers(actorId, true), body: JSON.stringify({ baselineRuleVersionId: baselineId, candidateRuleVersionId: candidateId, fixtureSetId }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, '影子分析失败。'));
      const result = ruleShadowRunCreationResponseSchema.parse(await response.json()); setSelectedShadow(result.run);
      setShadowRuns((current) => current.some((item) => item.id === result.run.id) ? current : [result.run, ...current]);
      setMessage(result.created ? '影子分析已完成并固化证据。' : '相同输入已有证据，本次返回既有记录。');
    } catch (reason: unknown) { setMessage(reason instanceof Error ? reason.message : '影子分析失败。'); }
    finally { setPending(false); }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([fixtureTemplate()], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'golden-fixtures.template.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  if (!ready) return <section className="rule-workbench"><div className="onboarding-card">正在读取规则治理数据…</div></section>;
  return <section className="rule-workbench">
    <aside className="rule-sidebar">
      <div className="rule-safety"><p className="eyebrow">安全边界</p><strong>本页不提供默认税率</strong><span>仅接收专业人员签审的脱敏样本。生产身份上线前，操作人 UUID 仅用于开发验收。</span></div>
      <div className="onboarding-card rule-selector">
        <label>开发态操作人 UUID<input value={actorId} onChange={(event) => setActorId(event.target.value)} /></label>
        <button type="button" className="secondary" onClick={saveActor} disabled={pending}>应用操作人</button>
        <label>规则包<select value={packageId} onChange={(event) => void selectPackage(event.target.value)}><option value="">请选择</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></label>
        <label>样本所属规则版本<select value={versionId} onChange={(event) => void selectVersion(event.target.value)} disabled={!packageId}><option value="">请选择</option>{versions.map((item) => <option key={item.id} value={item.id}>{item.versionTag} · {statusNames[item.status]}</option>)}</select></label>
        {currentVersion && <div className={`rule-eligibility ${canSign ? 'ok' : 'blocked'}`}><strong>{canSign ? '可签署样本' : '当前不可签署'}</strong><small>{canSign ? '当前操作人是该版本财税复核人。' : '版本须处于“财税已复核”，且操作人须与财税复核人一致。'}</small></div>}
      </div>
    </aside>
    <div className="rule-main">
      <form className="onboarding-card fixture-form" onSubmit={(event) => void submitFixtureSet(event)}>
        <header><div><p className="eyebrow">专业样本录入</p><h2>黄金样本集</h2></div><button type="button" className="secondary" onClick={downloadTemplate}>下载 JSON 模板</button></header>
        <div className="fixture-meta"><label>样本版本<input required value={fixtureSetVersion} onChange={(event) => setFixtureSetVersion(event.target.value)} placeholder="YYYY.MM.DD-N" /></label><label>专业签审说明<input required minLength={10} value={professionalNote} onChange={(event) => setProfessionalNote(event.target.value)} placeholder="说明政策依据、属期、适用边界与复核结论" /></label></div>
        <div className="coverage-row">{scenarios.map((scenario) => <span className={scenarioCoverage.includes(scenario) ? 'covered' : ''} key={scenario}>{scenarioCoverage.includes(scenario) ? '✓' : '—'} {scenarioNames[scenario]}</span>)}</div>
        <label>样本 JSON<textarea rows={22} spellCheck={false} value={fixturesText} onChange={(event) => setFixturesText(event.target.value)} /><small>每个用例必须包含稳定 caseId、场景、脱敏输入、预期输出和专业解释；六类场景缺一不可。</small></label>
        <label className="fixture-attestation"><input type="checkbox" checked={redactionAttested} onChange={(event) => setRedactionAttested(event.target.checked)} /><span><strong>我确认样本已完成脱敏并由专业财税人员复核</strong><small>签署后内容和哈希不可覆盖；修改必须创建新版本。</small></span></label>
        <button className="primary button" disabled={pending || !canSign}>固化并签署样本集</button>
      </form>

      <section className="fixture-evidence">
        <header><div><p className="eyebrow">不可变执行证据</p><h2>样本执行</h2></div><select value={fixtureSetId} onChange={(event) => { setFixtureSetId(event.target.value); setExecution(null); setTestEvidenceNote(''); }} disabled={!fixtureSets.length}><option value="">选择样本集</option>{fixtureSets.map((item) => <option key={item.id} value={item.id}>{item.fixtureSetVersion} · {item.fixtures.length} 例</option>)}</select></header>
        {selectedFixture ? <div className="fixture-summary"><span>签署人 <code>{selectedFixture.signedOffBy}</code></span><span>内容哈希 <code>{selectedFixture.contentHash}</code></span><button type="button" className="secondary" onClick={() => void executeFixtures()} disabled={pending}>运行全量样本</button></div> : <p className="rule-empty">当前版本还没有已签审样本集。</p>}
        {execution && <div className={`execution-result ${execution.status}`}><strong>{execution.passedFixtures} / {execution.totalFixtures} 通过</strong><code>{execution.artifactHash}</code>{execution.results.filter((item) => !item.passed).map((item) => <span key={item.caseId}>{item.caseId}：{item.error ?? '实际输出与签审期望不一致'}</span>)}{execution.status === 'passed' && currentVersion?.status === 'tax_reviewed' && <div className="evidence-signoff"><label>财税测试签署结论<textarea rows={2} value={testEvidenceNote} onChange={(event) => setTestEvidenceNote(event.target.value)} placeholder="说明六类样本全量通过、适用边界和当前结论" /></label><button type="button" className="secondary" disabled={pending || currentVersion.taxReviewedBy !== actorId} onClick={() => void signTestEvidence()}>签署测试证据</button><small>仅该版本的财税复核人可签署；哈希、样本数和场景覆盖必须与本次执行完全一致。</small></div>}</div>}
      </section>

      <section className="fixture-evidence shadow-panel">
        <header><div><p className="eyebrow">发布前影响分析</p><h2>新旧版本对比</h2></div></header>
        <div className="shadow-controls"><label>基准版本<select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}><option value="">请选择</option>{versions.map((item) => <option key={item.id} value={item.id}>{item.versionTag} · {statusNames[item.status]}</option>)}</select></label><label>候选版本<select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}><option value="">请选择</option>{versions.map((item) => <option key={item.id} value={item.id}>{item.versionTag} · {statusNames[item.status]}</option>)}</select></label><button type="button" className="primary" onClick={() => void executeShadow()} disabled={pending || !fixtureSetId}>执行影子对比</button></div>
        {shadowRuns.length > 0 && <div className="shadow-history">{shadowRuns.map((run) => <button type="button" key={run.id} onClick={() => setSelectedShadow(run)}><span>{new Date(run.executedAt).toLocaleString('zh-CN')}</span><strong>{shadowStatusNames[run.status]}</strong><small>{run.identicalFixtures} 一致 · {run.changedFixtures} 变化 · {run.failedFixtures} 失败</small></button>)}</div>}
        {selectedShadow && <div className={`shadow-result ${selectedShadow.status}`}><div><strong>{shadowStatusNames[selectedShadow.status]}</strong><code>{selectedShadow.artifactHash}</code></div>{selectedShadow.differences.map((item) => <details key={item.caseId} open={item.status !== 'identical'}><summary><span>{item.caseId}</span><b>{shadowStatusNames[item.status]}</b></summary><div className="shadow-diff"><pre>{JSON.stringify(item.baseline, null, 2)}</pre><pre>{JSON.stringify(item.candidate, null, 2)}</pre></div></details>)}</div>}
      </section>
      {message && <p className={message.includes('失败') || message.includes('禁止') || message.includes('必须') || message.includes('不可') ? 'form-error rule-message' : 'form-success rule-message'} role="status">{message}</p>}
    </div>
  </section>;
}
