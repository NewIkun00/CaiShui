import { FilingWorkspace } from './filing-workspace';
import { PackageWorkspace } from './package-workspace';
export default function FilingsPage() {
  return (
    <main className="events-shell">
      <section className="events-heading filing-heading">
        <div>
          <p className="eyebrow">R2–R3 · 申报准备</p>
          <h1>征期、待办与不可变申报包</h1>
          <p>
            先管理版本化征期和任务，再以计算、复核和 SOP
            引用创建申报包。测试引用不包含真实税额，正式申报仍由用户在官方平台自主完成。
          </p>
        </div>
      </section>
      <FilingWorkspace />
      <PackageWorkspace />
    </main>
  );
}
