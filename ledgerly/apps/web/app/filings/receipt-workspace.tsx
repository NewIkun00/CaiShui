'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import {
  documentListResponseSchema,
  filingClosureListResponseSchema,
  filingClosureResponseSchema,
  filingEvidenceListResponseSchema,
  filingEvidenceResponseSchema,
  filingPackageListResponseSchema,
  type DocumentResponse,
  type FilingClosureResponse,
  type FilingEvidenceResponse,
  type FilingPackageResponse,
} from '@ledgerly/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

interface Workspace {
  tenantId: string;
  companyId: string;
}
const actorId = '10000000-0000-4000-8000-000000000001';
const blockerLabels: Record<string, string> = {
  TASK_NOT_PAID: '任务尚未完成缴款',
  PACKAGE_NOT_FROZEN: '申报包尚未冻结',
  FILING_RECEIPT_REQUIRED: '缺少申报回执',
  PAYMENT_PROOF_REQUIRED: '缺少完税凭证',
  RESULT_HASH_MISMATCH: '回执结果与冻结快照不一致',
  OPEN_ADJUSTMENT_WORK_ORDER: '仍有未完成的更正/补退税工单',
};
function api() {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}
function workspace(): Workspace | null {
  try {
    const value = JSON.parse(
      window.localStorage.getItem('ledgerly.context') ?? 'null',
    ) as Partial<Workspace> | null;
    return value && typeof value.tenantId === 'string' && typeof value.companyId === 'string'
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
    const body = (await response.json()) as { message?: unknown; blockers?: unknown };
    const message = typeof body.message === 'string' ? body.message : fallback;
    const blockers = Array.isArray(body.blockers)
      ? body.blockers.filter((item): item is string => typeof item === 'string')
      : [];
    return blockers.length
      ? `${message}：${blockers.map((item) => blockerLabels[item] ?? item).join('、')}`
      : message;
  } catch {
    return fallback;
  }
}

export function ReceiptWorkspace() {
  const [context, setContext] = useState<Workspace | null>(null),
    [packages, setPackages] = useState<FilingPackageResponse[]>([]),
    [documents, setDocuments] = useState<DocumentResponse[]>([]),
    [evidence, setEvidence] = useState<FilingEvidenceResponse[]>([]),
    [closures, setClosures] = useState<FilingClosureResponse[]>([]),
    [packageId, setPackageId] = useState(''),
    [kind, setKind] = useState<'filing_receipt' | 'tax_payment_proof'>('filing_receipt'),
    [documentId, setDocumentId] = useState(''),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === packageId),
    [packages, packageId],
  );
  const selectedDocument = useMemo(
    () => documents.find((item) => item.id === documentId),
    [documents, documentId],
  );
  const isClosed = closures.some((item) => item.filingPackageId === packageId);
  const loadEvidence = useCallback(async (current: Workspace, nextPackageId: string) => {
    if (!nextPackageId) {
      setEvidence([]);
      return;
    }
    const response = await apiFetch(
      `${api()}/v1/companies/${current.companyId}/filing-packages/${nextPackageId}/evidence`,
      { headers: headers(current) },
    );
    if (!response.ok) throw new Error('无法读取申报回执。');
    setEvidence(filingEvidenceListResponseSchema.parse(await response.json()).items);
  }, []);
  const load = useCallback(
    async (current: Workspace) => {
      const base = `${api()}/v1/companies/${current.companyId}`;
      const [packageResponse, documentResponse, closureResponse] = await Promise.all([
        apiFetch(`${base}/filing-packages`, { headers: headers(current) }),
        apiFetch(`${base}/documents`, { headers: headers(current) }),
        apiFetch(`${base}/filing-packages/closures/all`, { headers: headers(current) }),
      ]);
      if (!packageResponse.ok || !documentResponse.ok || !closureResponse.ok)
        throw new Error('无法读取 R4 回执工作区。');
      const nextPackages = filingPackageListResponseSchema
        .parse(await packageResponse.json())
        .items.filter((item) => item.status === 'frozen');
      const nextDocuments = documentListResponseSchema.parse(await documentResponse.json()).items;
      setPackages(nextPackages);
      setDocuments(nextDocuments);
      setClosures(filingClosureListResponseSchema.parse(await closureResponse.json()).items);
      const nextPackageId = nextPackages[0]?.id ?? '';
      setPackageId(nextPackageId);
      setDocumentId(nextDocuments[0]?.id ?? '');
      await loadEvidence(current, nextPackageId);
    },
    [loadEvidence],
  );
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
  async function selectPackage(id: string) {
    setPackageId(id);
    if (context) await loadEvidence(context, id);
  }
  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || !selectedPackage || !selectedDocument) return;
    const version = selectedDocument.versions.find(
      (item) => item.versionNumber === selectedDocument.currentVersion,
    );
    if (!version) return;
    const form = new FormData(event.currentTarget);
    const occurredAt = form.get('occurredAt');
    if (typeof occurredAt !== 'string') return;
    setPending(true);
    setMessage(null);
    try {
      const body = {
        kind,
        documentId: selectedDocument.id,
        documentVersion: version.versionNumber,
        documentHash: version.sha256,
        externalReference: form.get('externalReference'),
        occurredAt: new Date(occurredAt).toISOString(),
        note: form.get('note'),
        ...(kind === 'filing_receipt'
          ? { reportedResultHash: selectedPackage.snapshot.resultHash }
          : {}),
      };
      const response = await apiFetch(
        `${api()}/v1/companies/${context.companyId}/filing-packages/${selectedPackage.id}/evidence`,
        { method: 'POST', headers: headers(context, true), body: JSON.stringify(body) },
      );
      if (!response.ok) throw new Error(await failure(response, '凭证归档失败。'));
      filingEvidenceResponseSchema.parse(await response.json());
      await loadEvidence(context, selectedPackage.id);
      setMessage(
        kind === 'filing_receipt'
          ? '申报回执已按文档版本和哈希追加归档。'
          : '完税凭证已按文档版本和哈希追加归档。',
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '凭证归档失败。');
    } finally {
      setPending(false);
    }
  }
  async function close() {
    if (!context || !selectedPackage) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `${api()}/v1/companies/${context.companyId}/filing-packages/${selectedPackage.id}/close`,
        {
          method: 'POST',
          headers: headers(context, true),
          body: JSON.stringify({ note: '用户核对申报回执、完税凭证与冻结结果一致后关闭' }),
        },
      );
      if (!response.ok) throw new Error(await failure(response, '关闭失败。'));
      const saved = filingClosureResponseSchema.parse(await response.json());
      setClosures((current) =>
        current.some((item) => item.id === saved.id) ? current : [saved, ...current],
      );
      setMessage('申报任务已形成不可变关闭记录，原申报包、回执和快照均不会被覆盖。');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '关闭失败。');
    } finally {
      setPending(false);
    }
  }
  if (!ready)
    return (
      <section className="filing-package-shell">
        <div className="onboarding-card">正在读取 R4 回执工作区…</div>
      </section>
    );
  if (!context)
    return (
      <section className="filing-package-shell">
        <div className="onboarding-card">请先完成企业建档。</div>
      </section>
    );
  return (
    <section className="filing-package-shell receipt-shell">
      <header className="filing-package-heading">
        <div>
          <p className="eyebrow">R4 · 回执与关闭</p>
          <h2>归档申报结果并关闭任务</h2>
        </div>
        <span>凭证追加后不可覆盖</span>
      </header>
      <div className="filing-package-grid">
        <form className="onboarding-card filing-sop-form" onSubmit={(event) => void archive(event)}>
          <h3>④ 追加回执 / 完税凭证</h3>
          <label>
            冻结申报包
            <select value={packageId} onChange={(event) => void selectPackage(event.target.value)}>
              <option value="">请选择</option>
              {packages.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.packageNumber} · {item.contentHash.slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <label>
            凭证类型
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="filing_receipt">申报回执</option>
              <option value="tax_payment_proof">完税凭证</option>
            </select>
          </label>
          <label>
            已归档文档
            <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
              <option value="">请先在档案页上传</option>
              {documents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · V{item.currentVersion}
                </option>
              ))}
            </select>
          </label>
          <label>
            官方/测试回执编号
            <input
              name="externalReference"
              minLength={3}
              maxLength={200}
              required
              placeholder="输入凭证上的唯一编号"
            />
          </label>
          <label>
            发生时间
            <input name="occurredAt" type="datetime-local" required />
          </label>
          <label>
            核对说明
            <textarea
              name="note"
              minLength={5}
              maxLength={2000}
              required
              defaultValue="仅用于 R4 非生产流程验证，已核对文档版本和哈希"
            />
          </label>
          {kind === 'filing_receipt' && (
            <small>
              结果哈希将与冻结快照自动核对：
              {selectedPackage?.snapshot.resultHash?.slice(0, 16) ?? '当前包缺少结果哈希'}…
            </small>
          )}
          <button
            className="primary button"
            disabled={pending || !packageId || !documentId || isClosed}
          >
            追加不可变凭证
          </button>
        </form>
        <section className="onboarding-card filing-package-form receipt-summary">
          <h3>⑤ 核对并关闭</h3>
          {!selectedPackage ? (
            <p>尚无已冻结申报包。</p>
          ) : (
            <>
              <p>申报包 #{selectedPackage.packageNumber}</p>
              <code>{selectedPackage.contentHash}</code>
              <div className="receipt-counts">
                <span>
                  申报回执 <b>{evidence.filter((item) => item.kind === 'filing_receipt').length}</b>
                </span>
                <span>
                  完税凭证{' '}
                  <b>{evidence.filter((item) => item.kind === 'tax_payment_proof').length}</b>
                </span>
              </div>
              {evidence.map((item) => (
                <article key={item.id}>
                  <strong>
                    {item.kind === 'filing_receipt' ? '申报回执' : '完税凭证'} ·{' '}
                    {item.externalReference}
                  </strong>
                  <small>
                    文档 V{item.documentVersion} · {item.documentHash.slice(0, 14)}…
                  </small>
                </article>
              ))}
              <button
                className="primary button"
                type="button"
                disabled={pending || isClosed}
                onClick={() => void close()}
              >
                {isClosed ? '✓ 已关闭' : '核对一致并关闭'}
              </button>
            </>
          )}
        </section>
      </div>
      {message && (
        <p
          className={
            message.includes('失败') || message.includes('缺少') || message.includes('不能')
              ? 'form-error filing-message'
              : 'form-success filing-message'
          }
          role="status"
        >
          {message}
        </p>
      )}
      <p className="filing-production-boundary">
        正式边界：这里只归档用户从官方渠道取得的结果，不代登录、不代申报、不发起扣款。测试数据必须使用明确的
        TEST 标识。
      </p>
    </section>
  );
}
