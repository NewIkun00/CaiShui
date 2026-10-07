import Link from 'next/link';
import { BankImportManager } from './bank-import-manager';

export default function BankImportPage() {
  return <main className="form-shell profile-shell"><Link className="back" href="/events">← 返回业务事件</Link><div className="form-heading"><p className="eyebrow">数据导入 · 银行流水</p><h1>先校验，再入账</h1><p>V1 使用固定 CSV 模板。上传后仅生成预览；只有全部错误处理完成并由你确认，才会生成已确认的收付款业务事件。</p></div><BankImportManager /></main>;
}
