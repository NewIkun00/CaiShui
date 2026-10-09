'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import {
  calculationRunListResponseSchema,
  filingPackageListResponseSchema,
  filingPackageResponseSchema,
  filingSopCreationResponseSchema,
  filingSopListResponseSchema,
  filingTestResultFixtureResponseSchema,
  reviewCaseListResponseSchema,
  filingTaskListResponseSchema,
  type CalculationRunResponse,
  type FilingPackageResponse,
  type FilingSopResponse,
  type FilingTaskResponse,
  type ReviewCaseResponse,
} from '@ledgerly/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
interface Workspace {
  tenantId: string;
  companyId: string;
}
const actorId = '10000000-0000-4000-8000-000000000001';
const blockerLabels = {
  PACKAGE_NOT_DRAFT: '申报包已冻结',
  RED_REVIEW_BLOCKER: '仍有红色复核阻断',
  APPROVED_REVIEW_REQUIRED: '缺少已批准复核',
  CALCULATION_RESULT_REQUIRED: '缺少计算结果引用',
  INPUT_HASH_REQUIRED: '缺少输入哈希',
  RULE_HASH_REQUIRED: '缺少规则哈希',
  RESULT_HASH_REQUIRED: '缺少结果哈希',
  SOP_HASH_REQUIRED: '缺少 SOP 哈希',
  REFERENCE_HASH_MISMATCH: '引用已变化，请重新建包',
} as const;
function api() {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}
function workspace(): Workspace | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Partial<Workspace>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string'
      ? { tenantId: value.tenantId, companyId: value.companyId }
      : null;
  } catch {
    return null;
  }
}
function headers(context: Workspace, json = false) {
  return {
    'x-user-id': actorId,
    'x-tenant-id': context.tenantId,
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}
async function failure(response: Response, fallback: string) {
  try {
    const value: unknown = await response.json();
    if (value && typeof value === 'object') {
      const body = value as { message?: unknown; blockers?: unknown };
      const message = typeof body.message === 'string' ? body.message : fallback;
      const blockers = Array.isArray(body.blockers)
        ? body.blockers.filter(
            (item): item is keyof typeof blockerLabels =>
              typeof item === 'string' && item in blockerLabels,
          )
        : [];
      return blockers.length
        ? `${message}：${blockers.map((item) => blockerLabels[item]).join('、')}`
        : message;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
export function PackageWorkspace() {
  const [context, setContext] = useState<Workspace | null>(null),
    [sops, setSops] = useState<FilingSopResponse[]>([]),
    [tasks, setTasks] = useState<FilingTaskResponse[]>([]),
    [runs, setRuns] = useState<CalculationRunResponse[]>([]),
    [reviews, setReviews] = useState<ReviewCaseResponse[]>([]),
    [packages, setPackages] = useState<FilingPackageResponse[]>([]),
    [taskId, setTaskId] = useState(''),
    [runId, setRunId] = useState(''),
    [sopId, setSopId] = useState(''),
    [reviewId, setReviewId] = useState(''),
    [correctionId, setCorrectionId] = useState(''),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [ready, setReady] = useState(false);
  const approved = useMemo(() => reviews.filter((item) => item.status === 'approved'), [reviews]);
  const load = useCallback(async (current: Workspace) => {
    const h = headers(current),
      base = `${api()}/v1/companies/${current.companyId}`,
      [sopResponse, taskResponse, runResponse, reviewResponse, packageResponse] = await Promise.all(
        [
          apiFetch(`${api()}/v1/filing-sops`, { headers: h }),
          apiFetch(`${base}/filing-tasks`, { headers: h }),
          apiFetch(`${base}/calculation-runs`, { headers: h }),
          apiFetch(`${base}/review-cases`, { headers: h }),
          apiFetch(`${base}/filing-packages`, { headers: h }),
        ],
      );
    if (
      [sopResponse, taskResponse, runResponse, reviewResponse, packageResponse].some(
        (response) => !response.ok,
      )
    )
      throw new Error('无法读取 R3 申报包工作区。');
    const nextSops = filingSopListResponseSchema.parse(await sopResponse.json()).items,
      nextTasks = filingTaskListResponseSchema.parse(await taskResponse.json()).items,
      nextRuns = calculationRunListResponseSchema.parse(await runResponse.json()).items,
      nextReviews = reviewCaseListResponseSchema.parse(await reviewResponse.json()).items,
      nextPackages = filingPackageListResponseSchema.parse(await packageResponse.json()).items;
    setSops(nextSops);
    setTasks(nextTasks);
    setRuns(nextRuns);
    setReviews(nextReviews);
    setPackages(nextPackages);
    setTaskId((value) =>
      nextTasks.some((item) => item.id === value) ? value : (nextTasks[0]?.id ?? ''),
    );
    setRunId((value) =>
      nextRuns.some((item) => item.id === value) ? value : (nextRuns[0]?.id ?? ''),
    );
    setSopId((value) =>
      nextSops.some((item) => item.id === value) ? value : (nextSops[0]?.id ?? ''),
    );
    setReviewId((value) =>
      nextReviews.some((item) => item.id === value && item.status === 'approved')
        ? value
        : (nextReviews.find((item) => item.status === 'approved')?.id ?? ''),
    );
  }, []);
  useEffect(() => {
    const current = workspace();
    setContext(current);
    if (!current) {
      setReady(true);
      return;
    }
    void load(current)
      .catch((error) => setMessage(error instanceof Error ? error.message : '读取失败。'))
      .finally(() => setReady(true));
  }, [load]);
  async function createSop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await apiFetch(`${api()}/v1/filing-sops`, {
        method: 'POST',
        headers: headers(context, true),
        body: JSON.stringify({
          name: form.get('name'),
          versionTag: form.get('versionTag'),
          jurisdictionCode: form.get('jurisdictionCode'),
          source: { type: 'test_fixture', title: form.get('sourceTitle') },
          steps: [
            { code: 'prepare_package', title: '准备申报包', instruction: form.get('instruction') },
          ],
        }),
      });
      if (!response.ok) throw new Error(await failure(response, 'SOP 保存失败。'));
      const result = filingSopCreationResponseSchema.parse(await response.json());
      setSops((current) =>
        current.some((item) => item.id === result.sop.id) ? current : [result.sop, ...current],
      );
      setSopId(result.sop.id);
      setMessage(result.created ? '测试 SOP 已固化，后续不能覆盖。' : '相同 SOP 版本已经存在。');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'SOP 保存失败。');
    } finally {
      setPending(false);
    }
  }
  async function createFixture() {
    if (!context || !runId) return;
    setPending(true);
    try {
      const response = await apiFetch(
        `${api()}/v1/companies/${context.companyId}/filing-packages/test-result-fixtures`,
        {
          method: 'POST',
          headers: headers(context, true),
          body: JSON.stringify({ calculationRunId: runId, attestation: 'TEST_FIXTURE_ONLY' }),
        },
      );
      if (!response.ok) throw new Error(await failure(response, '测试结果引用创建失败。'));
      const result = filingTestResultFixtureResponseSchema.parse(await response.json());
      setMessage(
        `测试引用已生成：${result.resultHash.slice(0, 12)}…。它不包含税率或税额，不能用于生产申报。`,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '测试引用创建失败。');
    } finally {
      setPending(false);
    }
  }
  async function createPackage() {
    if (!context || !taskId || !runId || !sopId || !reviewId) return;
    setPending(true);
    try {
      const response = await apiFetch(`${api()}/v1/companies/${context.companyId}/filing-packages`, {
        method: 'POST',
        headers: headers(context, true),
        body: JSON.stringify({
          filingTaskId: taskId,
          calculationRunId: runId,
          sopVersionId: sopId,
          reviewCaseIds: [reviewId],
          ...(correctionId ? { correctionOfPackageId: correctionId } : {}),
        }),
      });
      if (!response.ok) throw new Error(await failure(response, '申报包草稿创建失败。'));
      const saved = filingPackageResponseSchema.parse(await response.json());
      setPackages((current) => [saved, ...current]);
      setMessage(
        saved.blockers.length
          ? `草稿已保存，仍有 ${saved.blockers.length} 项冻结阻断。`
          : '草稿引用完整，可以执行冻结前实时复核。',
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '申报包草稿创建失败。');
    } finally {
      setPending(false);
    }
  }
  async function freeze(item: FilingPackageResponse) {
    if (!context) return;
    setPending(true);
    try {
      const response = await apiFetch(
        `${api()}/v1/companies/${context.companyId}/filing-packages/${item.id}/freeze`,
        {
          method: 'POST',
          headers: headers(context, true),
          body: JSON.stringify({
            expectedVersion: item.version,
            note: '用户确认测试引用、复核结论与 SOP 均已重新核对',
          }),
        },
      );
      if (!response.ok) throw new Error(await failure(response, '冻结失败。'));
      const saved = filingPackageResponseSchema.parse(await response.json());
      setPackages((current) =>
        current.map((existing) => (existing.id === saved.id ? saved : existing)),
      );
      setMessage('申报包已冻结，原始快照不会再被覆盖；后续变更必须新建更正版本。');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '冻结失败。');
    } finally {
      setPending(false);
    }
  }
  if (!ready)
    return (
      <section className="filing-package-shell">
        <div className="onboarding-card">正在读取 R3 冻结工作区…</div>
      </section>
    );
  if (!context)
    return (
      <section className="filing-package-shell">
        <div className="onboarding-card">请先完成企业建档。</div>
      </section>
    );
  return (
    <section className="filing-package-shell">
      <header className="filing-package-heading">
        <div>
          <p className="eyebrow">R3 · 不可变申报包</p>
          <h2>冻结准备与引用核验</h2>
        </div>
        <span>TEST FIXTURE 流程不会生成真实税额</span>
      </header>
      <div className="filing-package-grid">
        <form
          className="onboarding-card filing-sop-form"
          onSubmit={(event) => void createSop(event)}
        >
          <h3>① 版本化测试 SOP</h3>
          <label>
            名称
            <input name="name" minLength={3} defaultValue="R3 测试申报 SOP" required />
          </label>
          <label>
            版本号
            <input
              name="versionTag"
              pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{1,39}"
              placeholder="fixture-1"
              required
            />
          </label>
          <label>
            辖区
            <input
              name="jurisdictionCode"
              defaultValue="CN-JS"
              pattern="CN(-[A-Z0-9]{2,6})?"
              required
            />
          </label>
          <label>
            来源说明
            <input
              name="sourceTitle"
              defaultValue="仅用于 R3 冻结流程验证"
              minLength={3}
              required
            />
          </label>
          <label>
            操作步骤
            <textarea
              name="instruction"
              defaultValue="核对任务、计算引用、复核决定与哈希后，由用户前往官方平台自主申报"
              minLength={5}
              required
            />
          </label>
          <button className="secondary button" disabled={pending}>
            固化测试 SOP
          </button>
        </form>
        <section className="onboarding-card filing-package-form">
          <h3>② 准备申报包</h3>
          <label>
            申报任务
            <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
              <option value="">请选择</option>
              {tasks.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label} · {item.periodStart}
                </option>
              ))}
            </select>
          </label>
          <label>
            计算运行
            <select value={runId} onChange={(event) => setRunId(event.target.value)}>
              <option value="">请选择</option>
              {runs.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.taxType} · {item.periodStart} · {item.status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary button"
            type="button"
            disabled={pending || !runId}
            onClick={() => void createFixture()}
          >
            生成无税额测试引用
          </button>
          <label>
            SOP 版本
            <select value={sopId} onChange={(event) => setSopId(event.target.value)}>
              <option value="">请选择</option>
              {sops.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.versionTag}
                </option>
              ))}
            </select>
          </label>
          <label>
            已批准复核
            <select value={reviewId} onChange={(event) => setReviewId(event.target.value)}>
              <option value="">请选择</option>
              {approved.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.summary} · V{item.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            更正父包（可选）
            <select value={correctionId} onChange={(event) => setCorrectionId(event.target.value)}>
              <option value="">首次申报</option>
              {packages
                .filter((item) => item.status === 'frozen')
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    #{item.packageNumber} · {item.contentHash.slice(0, 10)}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="primary button"
            type="button"
            disabled={pending || !taskId || !runId || !sopId || !reviewId}
            onClick={() => void createPackage()}
          >
            创建不可变草稿
          </button>
          {approved.length === 0 && <small>当前没有已批准复核，请先到人工复核中心处理。</small>}
        </section>
      </div>
      <section className="filing-package-list">
        <header>
          <h3>③ 实时复核并冻结</h3>
          <small>冻结时服务端重新读取全部引用，不信任页面缓存。</small>
        </header>
        {packages.length === 0 ? (
          <div className="filing-empty">尚无申报包草稿。</div>
        ) : (
          packages.map((item) => (
            <article key={item.id}>
              <div>
                <div className="filing-badges">
                  <span>#{item.packageNumber}</span>
                  <em>{item.status === 'frozen' ? '已冻结' : '草稿'}</em>
                  {item.snapshot.taxResultSource === 'test_fixture' && <i>TEST RESULT</i>}
                </div>
                <strong>{item.contentHash.slice(0, 18)}…</strong>
                <small>
                  任务 {item.snapshot.filingTaskId} · 版本 V{item.version}
                </small>
                {item.correctionOfPackageId && <small>更正自 {item.correctionOfPackageId}</small>}
                <div className="filing-blockers">
                  {item.blockers.length ? (
                    item.blockers.map((code) => <b key={code}>{blockerLabels[code]}</b>)
                  ) : (
                    <b className="clear">当前快照无已知阻断</b>
                  )}
                </div>
              </div>
              {item.status === 'draft' ? (
                <button
                  className="primary button"
                  disabled={pending}
                  onClick={() => void freeze(item)}
                >
                  重新校验并冻结
                </button>
              ) : (
                <span className="filing-done">✓ 不可变</span>
              )}
            </article>
          ))
        )}
      </section>
      {message && (
        <p
          className={
            message.includes('失败') || message.includes('阻断')
              ? 'form-error filing-message'
              : 'form-success filing-message'
          }
          role="status"
        >
          {message}
        </p>
      )}
      <p className="filing-production-boundary">
        生产边界：系统不代登录税务平台、不保存税务密码或验证码、不发起扣款。正式结果必须等待经专业签审的税务规则和计算实现。
      </p>
    </section>
  );
}
