import Link from 'next/link';

const quickActions = [
  { href:'/onboarding', icon:'企', title:'建立企业档案', text:'录入基础信息并完成适用性筛查', tone:'jade' },
  { href:'/imports/bank', icon:'流', title:'导入银行流水', text:'上传本期 CSV 对账单并核验', tone:'blue' },
  { href:'/invoices', icon:'票', title:'录入发票', text:'建立进销项发票事实和证据链', tone:'amber' },
] as const;

const flows = [
  ['01','建立企业档案','录入主体与税务信息，确认 V1 适用范围','当前步骤'],
  ['02','汇集业务证据','整理银行流水、发票、合同和业务事项','等待开始'],
  ['03','记账与核对','生成凭证草稿、账簿、报表和差异清单','等待开始'],
  ['04','复核与申报','专业人员复核后，由用户前往官方平台提交','等待开始'],
] as const;

export default function HomePage() {
  return <main className="overview-page">
    <section className="overview-welcome">
      <div>
        <span className="section-kicker">今日工作台</span>
        <h2>欢迎回来，开始整理公司的本期账务。</h2>
        <p>系统负责形成草稿、校验和证据链；关键判断由你确认，高风险事项进入专业复核。</p>
      </div>
      <Link className="overview-primary" href="/onboarding"><span>＋</span>建立企业档案</Link>
    </section>

    <section className="metric-grid" aria-label="本期关键指标">
      <article><div className="metric-head"><span className="metric-icon jade">¥</span><small>账面资金</small></div><strong>—</strong><p>完成建档后开始汇总</p></article>
      <article><div className="metric-head"><span className="metric-icon blue">票</span><small>本期发票</small></div><strong>0 <em>张</em></strong><p>销项与进项统一管理</p></article>
      <article><div className="metric-head"><span className="metric-icon violet">✓</span><small>待处理事项</small></div><strong>1 <em>项</em></strong><p className="metric-attention">企业档案等待建立</p></article>
      <article><div className="metric-head"><span className="metric-icon amber">税</span><small>试算状态</small></div><strong className="metric-text">尚未就绪</strong><p>缺少企业画像与业务事实</p></article>
    </section>

    <section className="overview-grid">
      <article className="panel process-panel">
        <header><div><span className="section-kicker">V1 工作流程</span><h3>从建档到申报，每一步都有依据</h3></div><span className="panel-chip">0 / 4 已完成</span></header>
        <div className="process-list">
          {flows.map(([number,title,text,status],index)=><div className={index===0?'current':''} key={number}>
            <span className="process-number">{number}</span>
            <i />
            <div><strong>{title}</strong><p>{text}</p></div>
            <small>{status}</small>
          </div>)}
        </div>
      </article>

      <aside className="overview-side">
        <article className="panel quick-panel">
          <header><div><span className="section-kicker">快捷操作</span><h3>从这里开始</h3></div></header>
          <div>{quickActions.map(item=><Link href={item.href} key={item.href}>
            <span className={`quick-icon ${item.tone}`}>{item.icon}</span><div><strong>{item.title}</strong><p>{item.text}</p></div><b>›</b>
          </Link>)}</div>
        </article>
        <article className="safety-panel">
          <div className="safety-mark">盾</div>
          <div><span>受控操作边界</span><strong>你的凭证和判断始终可追溯</strong><p>V1 不保存税务平台密码，不自动登录或代替提交申报。</p></div>
        </article>
      </aside>
    </section>
  </main>;
}
