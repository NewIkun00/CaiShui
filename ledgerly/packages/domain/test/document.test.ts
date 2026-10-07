import { describe, expect, it } from 'vitest';
import { createDocument, DocumentType, nextDocumentVersion } from '../src/index.js';

describe('document', () => {
  it('creates a normalized document and advances immutable versions', () => {
    const first = createDocument({ type: DocumentType.Contract, title: '  服务合同  ', accountingMonth: '2026-10' });
    const second = nextDocumentVersion(first);
    expect(first.title).toBe('服务合同'); expect(first.currentVersion).toBe(1);
    expect(second.currentVersion).toBe(2);
  });

  it('rejects invalid accounting months', () => {
    expect(() => createDocument({ type: DocumentType.Other, title: '资料', accountingMonth: '2026-13' })).toThrow('YYYY-MM');
  });
});
