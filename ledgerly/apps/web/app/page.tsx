import Link from 'next/link';

const milestones = [
  ['01', '建立企业档案', '录入公司和税务基础信息，先判断平台是否适用。'],
  ['02', '汇集业务证据', '统一管理银行流水、发票、合同和业务事项。'],
  ['03', '核对并生成草稿', '通过明确规则生成账务与税费草稿，所有结果可追溯。'],
  ['04', '专业复核与申报', '高风险事项进入人工复核，用户在官方平台自主提交。'],
] as const;

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <div className="brand"><span>账</span>账税通</div>
        <div className="badge">V1 受控试点</div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">一人公司财务工作台</p>
          <h1>把记账、核对和报税，<br />变成一条看得懂的流程。</h1>
          <p className="lede">系统提供草稿、校验和证据链；关键判断由你确认，高风险事项由专业人员复核。</p>
          <Link className="primary" href="/onboarding">开始建立企业档案</Link>
        </div>
        <aside className="status-card">
          <p>本期状态</p>
          <strong>等待建档</strong>
          <div className="progress"><i /></div>
          <small>完成企业档案后，系统将生成适用性结论和首批待办。</small>
        </aside>
      </section>
      <section className="steps" aria-label="产品流程">
        {milestones.map(([number, title, text]) => (
          <article key={number}>
            <span>{number}</span><h2>{title}</h2><p>{text}</p>
          </article>
        ))}
      </section>
      <section className="boundary">
        <div><p className="eyebrow">清晰边界</p><h2>平台辅助完成，不替你作出最终申报决定</h2></div>
        <p>V1 不保存税务平台密码，不自动登录或提交申报。每一项计算都保留输入、规则版本和复核记录。</p>
      </section>
    </main>
  );
}
