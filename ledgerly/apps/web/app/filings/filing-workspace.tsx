'use client';
import {
  filingCalendarCreationResponseSchema,
  filingCalendarListResponseSchema,
  filingTaskGenerationResponseSchema,
  filingTaskListResponseSchema,
  filingTaskResponseSchema,
  type FilingCalendarResponse,
  type FilingTaskResponse,
} from '@ledgerly/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
interface Workspace {
  tenantId: string;
  companyId: string;
}
const actorId = '10000000-0000-4000-8000-000000000001';
const taxLabels = {
  vat: '增值税',
  surcharge: '附加税费',
  corporate_income_tax: '企业所得税',
  stamp_duty: '印花税',
} as const;
const statusLabels = { todo: '待办', filed: '已申报', paid: '已缴款' } as const;
const timingLabels = {
  upcoming: '未到期',
  due_today: '今日到期',
  overdue: '已逾期',
  completed: '已完成',
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
async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string | { message?: string } };
    return typeof body.message === 'string' ? body.message : (body.message?.message ?? fallback);
  } catch {
    return fallback;
  }
}

export function FilingWorkspace() {
  const [context, setContext] = useState<Workspace | null>(null),
    [calendars, setCalendars] = useState<FilingCalendarResponse[]>([]),
    [tasks, setTasks] = useState<FilingTaskResponse[]>([]),
    [selectedCalendar, setSelectedCalendar] = useState(''),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [onlyTodos, setOnlyTodos] = useState(true);
  const visible = useMemo(
    () => (onlyTodos ? tasks.filter((task) => task.status !== 'paid') : tasks),
    [tasks, onlyTodos],
  );
  const load = useCallback(async (current: Workspace) => {
    const [calendarResponse, taskResponse] = await Promise.all([
      fetch(`${api()}/v1/filing-calendars`, { headers: headers(current) }),
      fetch(`${api()}/v1/companies/${current.companyId}/filing-tasks`, {
        headers: headers(current),
      }),
    ]);
    if (!calendarResponse.ok || !taskResponse.ok) throw new Error('无法读取征期与申报任务。');
    const nextCalendars = filingCalendarListResponseSchema.parse(
      await calendarResponse.json(),
    ).items;
    setCalendars(nextCalendars);
    setSelectedCalendar((value) =>
      nextCalendars.some((item) => item.id === value) ? value : (nextCalendars[0]?.id ?? ''),
    );
    setTasks(filingTaskListResponseSchema.parse(await taskResponse.json()).items);
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
  async function createCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) return;
    const form = new FormData(event.currentTarget),
      year = Number(form.get('year'));
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`${api()}/v1/filing-calendars`, {
        method: 'POST',
        headers: headers(context, true),
        body: JSON.stringify({
          name: form.get('name'),
          versionTag: form.get('versionTag'),
          jurisdictionCode: form.get('jurisdictionCode'),
          year,
          source: { type: 'test_fixture', title: form.get('sourceTitle') },
          entries: [
            {
              taxType: form.get('taxType'),
              label: form.get('label'),
              periodStart: form.get('periodStart'),
              periodEnd: form.get('periodEnd'),
              dueDate: form.get('dueDate'),
            },
          ],
        }),
      });
      if (!response.ok)
        throw new Error(
          await errorMessage(response, '测试日历保存失败，请检查年度、日期和版本号。'),
        );
      const result = filingCalendarCreationResponseSchema.parse(await response.json());
      setCalendars((current) =>
        current.some((item) => item.id === result.calendar.id)
          ? current
          : [result.calendar, ...current],
      );
      setSelectedCalendar(result.calendar.id);
      setMessage(
        result.created
          ? '测试日历已保存；所有日期均来自本次手工输入。'
          : '相同日历版本已存在，未重复创建。',
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setPending(false);
    }
  }
  async function generate() {
    if (!context || !selectedCalendar) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${api()}/v1/companies/${context.companyId}/filing-tasks/generate`,
        {
          method: 'POST',
          headers: headers(context, true),
          body: JSON.stringify({ calendarId: selectedCalendar, usage: 'test' }),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response, '任务生成失败。'));
      const result = filingTaskGenerationResponseSchema.parse(await response.json());
      setTasks((current) =>
        [
          ...result.items,
          ...current.filter((item) => !result.items.some((saved) => saved.id === item.id)),
        ].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      );
      setMessage(
        result.createdCount
          ? `已生成 ${result.createdCount} 个测试申报任务。`
          : '该日历的任务已存在，幂等生成未产生重复数据。',
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '生成失败。');
    } finally {
      setPending(false);
    }
  }
  async function transition(task: FilingTaskResponse) {
    if (!context) return;
    const action = task.status === 'todo' ? 'mark_filed' : 'mark_paid',
      note =
        task.status === 'todo'
          ? '用户确认已在官方平台自主完成申报'
          : '用户确认已在官方渠道完成缴款';
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${api()}/v1/companies/${context.companyId}/filing-tasks/${task.id}/transitions`,
        {
          method: 'POST',
          headers: headers(context, true),
          body: JSON.stringify({ expectedVersion: task.version, action, note }),
        },
      );
      if (!response.ok)
        throw new Error(await errorMessage(response, '任务状态已变化，请刷新后重试。'));
      const saved = filingTaskResponseSchema.parse(await response.json());
      setTasks((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setMessage(`任务已更新为“${statusLabels[saved.status]}”，操作人和时间已留痕。`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setPending(false);
    }
  }
  if (!ready)
    return (
      <section className="filing-workspace">
        <div className="onboarding-card">正在读取申报待办…</div>
      </section>
    );
  if (!context)
    return (
      <section className="filing-workspace">
        <div className="onboarding-card">请先完成企业建档，再配置征期日历。</div>
      </section>
    );
  return (
    <section className="filing-workspace">
      <aside className="filing-sidebar">
        <form
          className="onboarding-card filing-calendar-form"
          onSubmit={(event) => void createCalendar(event)}
        >
          <header>
            <p className="eyebrow">配置化 fixture</p>
            <h2>新建测试日历</h2>
          </header>
          <div className="filing-form-grid">
            <label>
              年度
              <input name="year" type="number" min="2020" max="2100" required />
            </label>
            <label>
              辖区代码
              <input
                name="jurisdictionCode"
                defaultValue="CN-JS"
                pattern="CN(-[A-Z0-9]{2,6})?"
                required
              />
            </label>
          </div>
          <label>
            日历名称
            <input name="name" placeholder="例：R2 流程测试日历" minLength={3} required />
          </label>
          <label>
            版本号
            <input
              name="versionTag"
              placeholder="例：fixture-1"
              pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{1,39}"
              required
            />
          </label>
          <label>
            测试来源说明
            <input name="sourceTitle" placeholder="仅作 R2 流程验证" minLength={3} required />
          </label>
          <label>
            税种
            <select name="taxType" defaultValue="vat">
              <option value="vat">增值税</option>
              <option value="surcharge">附加税费</option>
              <option value="corporate_income_tax">企业所得税</option>
              <option value="stamp_duty">印花税</option>
            </select>
          </label>
          <label>
            任务名称
            <input name="label" placeholder="例：某期测试申报" minLength={2} required />
          </label>
          <div className="filing-date-grid">
            <label>
              期间开始
              <input name="periodStart" type="date" required />
            </label>
            <label>
              期间结束
              <input name="periodEnd" type="date" required />
            </label>
            <label>
              测试到期日
              <input name="dueDate" type="date" required />
            </label>
          </div>
          <p className="filing-warning">
            此表单只创建测试日历。正式日历必须有 gov.cn 公告、文号、内容哈希与核验记录。
          </p>
          <button className="primary button" disabled={pending}>
            保存测试日历
          </button>
        </form>
        <section className="filing-generate">
          <h3>幂等生成</h3>
          <select
            value={selectedCalendar}
            onChange={(event) => setSelectedCalendar(event.target.value)}
          >
            <option value="">选择日历版本</option>
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name} · {calendar.versionTag}
              </option>
            ))}
          </select>
          <button
            className="secondary button"
            disabled={pending || !selectedCalendar}
            onClick={() => void generate()}
          >
            生成测试任务
          </button>
          <small>重复点击不会生成重复任务。测试日历请求“生产用途”会被服务端阻断。</small>
        </section>
      </aside>
      <main className="filing-board">
        <header>
          <div>
            <p className="eyebrow">站内待办</p>
            <h2>{visible.length} 个申报任务</h2>
          </div>
          <label>
            <input
              type="checkbox"
              checked={onlyTodos}
              onChange={(event) => setOnlyTodos(event.target.checked)}
            />
            仅看未完成
          </label>
        </header>
        {visible.length === 0 ? (
        <div className="filing-empty">
          {tasks.length > 0
            ? '未完成任务已清零。取消“仅看未完成”可查看已完成记录。'
            : '尚无申报待办。请先建立测试日历并生成任务。'}
        </div>
        ) : (
          <div className="filing-list">
            {visible.map((task) => (
              <article key={task.id} className={task.timing}>
                <div className="filing-task-main">
                  <div className="filing-badges">
                    <span>{taxLabels[task.taxType]}</span>
                    <em>{statusLabels[task.status]}</em>
                    <b>{timingLabels[task.timing]}</b>
                    {task.calendarSourceType === 'test_fixture' && <i>TEST FIXTURE</i>}
                  </div>
                  <h3>{task.label}</h3>
                  <p>
                    所属期 {task.periodStart} 至 {task.periodEnd} · 到期日 {task.dueDate}
                  </p>
                  <small>
                    {task.calendarName} · V{task.version} · 任务 {task.id}
                  </small>
                </div>
                {task.status !== 'paid' ? (
                  <button
                    className={task.timing === 'overdue' ? 'primary button' : 'secondary button'}
                    disabled={pending}
                    onClick={() => void transition(task)}
                  >
                    {task.status === 'todo' ? '确认已自主申报' : '确认已缴款'}
                  </button>
                ) : (
                  <span className="filing-done">✓ 完成</span>
                )}
              </article>
            ))}
          </div>
        )}
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
      </main>
    </section>
  );
}
