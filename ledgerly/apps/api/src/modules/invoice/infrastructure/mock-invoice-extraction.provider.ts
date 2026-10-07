import { Injectable } from '@nestjs/common';
import { InvoiceColor, InvoiceDirection, InvoiceKind } from '@ledgerly/domain';
import type { InvoiceExtraction, InvoiceExtractionCandidate, InvoiceExtractionProvider } from '../application/invoice-extraction-provider.js';

@Injectable()
export class MockInvoiceExtractionProvider implements InvoiceExtractionProvider {
  extract(text: string): Promise<InvoiceExtraction> {
    const read = (label: string) => text.match(new RegExp(`${label}\\s*[:：]\\s*([^\\n\\r]+)`))?.[1]?.trim();
    const directionText = read('方向'); const kindText = read('票种'); const colorText = read('蓝红');
    const invoiceNumber = read('发票号码'); const issuedOn = read('开票日期');
    const counterpartyName = read('往来单位'); const amountExcludingTax = read('不含税金额');
    const taxAmount = read('税额'); const totalAmount = read('价税合计'); const remarks = read('备注');
    const candidate: InvoiceExtractionCandidate = {
      ...(directionText ? { direction: directionText.includes('销') ? InvoiceDirection.Output : InvoiceDirection.Input } : {}),
      ...(kindText ? { kind: kindText.includes('专') ? InvoiceKind.Special : InvoiceKind.Ordinary } : {}),
      ...(colorText ? { color: colorText.includes('红') ? InvoiceColor.Red : InvoiceColor.Blue } : {}),
      ...(invoiceNumber ? { invoiceNumber } : {}), ...(issuedOn ? { issuedOn } : {}),
      ...(counterpartyName ? { counterpartyName } : {}),
      ...(amountExcludingTax ? { amountExcludingTax } : {}), ...(taxAmount ? { taxAmount } : {}),
      ...(totalAmount ? { totalAmount } : {}), ...(remarks ? { remarks } : {}),
    };
    const present = Object.values(candidate).filter(Boolean).length;
    const warnings = present < 9 ? ['模拟识别结果不完整，请补充并核对所有字段'] : [];
    return Promise.resolve({
      candidate, confidence: Math.min(0.95, Math.round((present / 9) * 100) / 100),
      warnings, provider: 'deterministic-mock-v1', requiresConfirmation: true,
    });
  }
}
