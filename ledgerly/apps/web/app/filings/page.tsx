import{FilingWorkspace}from'./filing-workspace';
export default function FilingsPage(){return <main className="events-shell"><section className="events-heading filing-heading"><div><p className="eyebrow">R2 · 申报任务</p><h1>征期与站内待办</h1><p>通过版本化日历生成幂等任务，跟踪待办、已申报和已缴款。当前只演示明确标识的测试日历，不会猜测正式征期。</p></div></section><FilingWorkspace/></main>}
