'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const baseItems = [
  ['企业档案', '企业全称、统一社会信用代码与所在城市', '已完成', 'done'],
  ['适用性筛查', '主体类型、纳税人身份与复杂业务风险边界', '已完成', 'done'],
] as const;

export default function DashboardPage() {
  const [ledgerReady, setLedgerReady] = useState(false);
  const [counterpartiesReady, setCounterpartiesReady] = useState(false);
  useEffect(() => {
    setLedgerReady(window.localStorage.getItem('ledgerly.ledgerSetup') !== null);
    setCounterpartiesReady(window.localStorage.getItem('ledgerly.counterpartiesReady') === 'true');
  }, []);
  const items = [
    ...baseItems,
    ['资金账户', '银行账户、启用前余额与资金来源，仅保存账号后四位', ledgerReady ? '已完成' : '等待设置', ledgerReady ? 'done' : 'current'],
    ['期初余额', '随资金账户启用，自动生成平衡的期初分录', ledgerReady ? '已完成' : '随资金账户设置', ledgerReady ? 'done' : 'todo'],
    ['往来单位', '客户、供应商、股东与员工的统一主体索引', counterpartiesReady ? '已完成' : '尚未开始', counterpartiesReady ? 'done' : ledgerReady ? 'current' : 'todo'],
    ['会计期间', '首个会计月份与期间锁定策略', ledgerReady ? '已建立首期' : '尚未开始', ledgerReady ? 'done' : 'todo'],
  ] as const;
  const completed = items.filter(([, , , kind]) => kind === 'done').length;
  const nextAction = counterpartiesReady
    ? { label: '进入业务记录', href: '/events', detail: '账套初始化已完成，可以开始记录第一笔真实业务。' }
    : ledgerReady
      ? { label: '设置往来单位', href: '/setup/counterparties', detail: '补齐常用客户、供应商与关联方，完成最后一项基础设置。' }
      : { label: '设置资金账户', href: '/setup/financial-account', detail: '先建立银行账户与启用前余额，系统会同步生成平衡的期初分录。' };
  return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/accounting">凭证与账簿</Link><Link className="setup-action" href="/reports">财务报表</Link><Link className="setup-action" href="/rules">规则样本</Link><div className="badge">初始化账套</div></nav></header>
    <section className="dashboard-head"><div><p className="eyebrow">建账进度</p><h1>把账套准备好，<br />再开始记录业务。</h1><p className="lede">适用性筛查已经完成。接下来设置公司银行账户、期初余额和往来单位，系统才会开放业务记录入口。</p></div><div className="completion"><div><small>SETUP READINESS</small><strong>{completed}<em>/ 6</em></strong></div><span>初始化项目已完成</span><div className="completion-track" aria-label={`建账进度 ${completed}/6`}><i style={{width:`${completed/6*100}%`}} /></div></div></section>
    <section className="next-action" aria-label="建议的下一步">
      <div className="next-action-mark" aria-hidden="true"><span>✦</span></div>
      <div><small>建议的下一步</small><h2>{nextAction.label}</h2><p>{nextAction.detail}</p></div>
      <Link href={nextAction.href}>继续处理 <span>→</span></Link>
    </section>
    <section className="setup-list">{items.map(([title,description,status,kind],index)=><article className={kind} key={title}><b>{String(index+1).padStart(2,'0')}</b><div><h2>{title}</h2><p>{description}</p><small>{status}</small></div>{kind==='current'&&title==='资金账户'?<Link className="setup-action" href="/setup/financial-account">开始设置 →</Link>:kind==='current'&&title==='往来单位'?<Link className="setup-action" href="/setup/counterparties">开始设置 →</Link>:<span>{kind==='done'?'已完成':'未开始'}</span>}</article>)}</section>
    <div className="dashboard-note"><span>{counterpartiesReady ? '初始化项目已经完成，可以进入业务记录阶段。' : ledgerReady ? '账户和首个会计期间已保存，请继续设置常用往来单位。' : '先完成资金账户设置。系统只保存银行账号后四位，不在当前版本保存完整卡号。'}</span><Link href="/onboarding/profile">查看适用性结论 →</Link></div>
  </main>;
}
