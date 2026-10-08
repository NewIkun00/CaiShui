'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const baseItems = [
  ['企业档案', '已完成', 'done'],
  ['适用性筛查', '已完成', 'done'],
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
    ['资金账户', ledgerReady ? '已完成' : '等待设置', ledgerReady ? 'done' : 'current'],
    ['期初余额', ledgerReady ? '已完成' : '随资金账户设置', ledgerReady ? 'done' : 'todo'],
    ['往来单位', counterpartiesReady ? '已完成' : '尚未开始', counterpartiesReady ? 'done' : ledgerReady ? 'current' : 'todo'],
    ['会计期间', ledgerReady ? '已建立首期' : '尚未开始', ledgerReady ? 'done' : 'todo'],
  ] as const;
  const completed = items.filter(([, , kind]) => kind === 'done').length;
  return <main><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/accounting">凭证与账簿</Link><Link className="setup-action" href="/reports">财务报表</Link><Link className="setup-action" href="/rules">规则样本</Link><div className="badge">初始化账套</div></nav></header><section className="dashboard-head"><div><p className="eyebrow">建档进度</p><h1>把账套准备好，<br />再开始记录业务。</h1><p className="lede">适用性筛查已经完成。接下来设置公司银行账户、期初余额和往来单位。</p>{counterpartiesReady&&<Link className="primary" href="/events">进入业务记录</Link>}</div><div className="completion"><strong>{completed} / 6</strong><span>初始化项目已完成</span></div></section><section className="setup-list">{items.map(([title,status,kind],index)=><article className={kind} key={title}><b>{String(index+1).padStart(2,'0')}</b><div><h2>{title}</h2><p>{status}</p></div>{kind==='current'&&title==='资金账户'?<Link className="setup-action" href="/setup/financial-account">开始设置</Link>:kind==='current'&&title==='往来单位'?<Link className="setup-action" href="/setup/counterparties">开始设置</Link>:<span>{kind==='done'?'✓':'—'}</span>}</article>)}</section><div className="dashboard-note">{counterpartiesReady ? '初始化项目已经完成，可以进入业务记录阶段。' : ledgerReady ? '账户和首个会计期间已保存，请继续设置常用往来单位。' : '请先完成资金账户设置。系统只保存账号后四位，不在当前版本保存完整银行卡号。'}<Link href="/onboarding/profile">查看适用性结论</Link></div></main>;
}
