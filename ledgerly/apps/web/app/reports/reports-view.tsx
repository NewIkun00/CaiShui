'use client';

import { financialReportsResponseSchema, type FinancialReportsResponse } from '@ledgerly/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }

function context(): WorkspaceContext | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<WorkspaceContext>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string' ? { tenantId:value.tenantId, companyId:value.companyId } : null;
  } catch { return null; }
}

function api() { return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'; }
function money(value: string) { return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(Number(value)); }

export function ReportsView() {
  const [ready,setReady]=useState(false);
  const [reports,setReports]=useState<FinancialReportsResponse|null>(null);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    const workspace=context();
    if(!workspace){setReady(true);return;}
    void fetch(`${api()}/v1/companies/${workspace.companyId}/accounting/reports`,{headers:{'x-user-id':'10000000-0000-4000-8000-000000000001','x-tenant-id':workspace.tenantId}})
      .then(async response=>{if(!response.ok)throw new Error('报表读取失败，请确认账套已经初始化。');return financialReportsResponseSchema.parse(await response.json());})
      .then(setReports).catch((reason:unknown)=>setError(reason instanceof Error?reason.message:'报表读取失败。')).finally(()=>setReady(true));
  },[]);

  if(!ready)return <section className="report-shell"><div className="onboarding-card">正在生成财务报表…</div></section>;
  if(error)return <section className="report-shell"><div className="report-alert danger"><strong>暂时无法生成报表</strong><span>{error}</span><Link href="/accounting">返回账务中心检查</Link></div></section>;
  if(!reports)return <section className="report-shell"><div className="report-alert"><strong>请先完成企业建档和账套初始化</strong><span>报表需要明确的会计期间和账簿数据。</span><Link href="/dashboard">返回工作台</Link></div></section>;

  const {profitStatement:profit,balanceSheet:balance}=reports;
  return <section className="report-shell">
    <div className="report-context">
      <div><span>报表期间</span><strong>{reports.period.start} — {reports.period.end}</strong></div>
      <div><span>数据口径</span><strong>期初分录 + 已确认凭证</strong></div>
      <div><span>科目模板</span><strong>{reports.basis.templateVersion}</strong></div>
      <div><span>期间状态</span><strong>{reports.period.status==='locked'?'已锁定':'开放记账'}</strong></div>
    </div>
    <div className={`report-check ${balance.balanced?'ok':'danger'}`}>
      <div><span>{balance.balanced?'✓':'!'}</span><div><strong>{balance.balanced?'资产负债表平衡':'资产负债表不平衡'}</strong><small>资产 − 负债 − 所有者权益 = {money(balance.difference)}</small></div></div>
      <Link href="/accounting">下钻科目余额与凭证明细</Link>
    </div>
    <div className="statement-grid">
      <Statement title="利润表" subtitle="本期发生额口径">
        <ReportGroup title="营业收入" lines={profit.revenue} empty="本期暂无收入" />
        <ReportGroup title="期间费用" lines={profit.expenses} empty="本期暂无费用" />
        <ReportTotal label="收入合计" value={profit.totalRevenue} />
        <ReportTotal label="费用合计" value={profit.totalExpenses} />
        <ReportTotal label="本期利润" value={profit.profit} emphasized />
      </Statement>
      <Statement title="资产负债表" subtitle="期末余额口径">
        <ReportGroup title="资产" lines={balance.assets} empty="暂无资产余额" />
        <ReportGroup title="负债" lines={balance.liabilities} empty="暂无负债余额" />
        <ReportGroup title="所有者权益" lines={balance.equity} empty="暂无权益科目余额" />
        <div className="report-row current-profit"><span>未结转本期利润</span><b>{money(balance.currentPeriodProfit)}</b></div>
        <ReportTotal label="资产合计" value={balance.totalAssets} />
        <ReportTotal label="负债合计" value={balance.totalLiabilities} />
        <ReportTotal label="所有者权益合计" value={balance.totalEquity} emphasized />
      </Statement>
    </div>
    <p className="report-disclaimer">当前为 V1 管理报表，采用最小科目模板并将未结转本期利润计入权益。正式对外报送前仍需扩展法定行项目映射并由会计专业人员复核。</p>
  </section>;
}

function Statement({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}) {
  return <article className="statement"><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><span>人民币元</span></header>{children}</article>;
}

function ReportGroup({title,lines,empty}:{title:string;lines:FinancialReportsResponse['profitStatement']['revenue'];empty:string}) {
  return <section className="report-group"><h3>{title}</h3>{lines.length===0?<p>{empty}</p>:lines.map(line=><div className="report-row" key={line.accountCode}><span><small>{line.accountCode}</small>{line.accountName}</span><b>{money(line.amount)}</b></div>)}</section>;
}

function ReportTotal({label,value,emphasized=false}:{label:string;value:string;emphasized?:boolean}) {
  return <div className={`report-total ${emphasized?'emphasized':''}`}><span>{label}</span><strong>{money(value)}</strong></div>;
}
