import { Injectable } from '@nestjs/common';
import type {
  AddDocumentVersionRecord, DocumentStore, LinkDocumentRecord, SavedDocument, SaveDocumentRecord,
} from '../application/document-store.js';

@Injectable()
export class MemoryDocumentStore implements DocumentStore {
  private readonly records = new Map<string, SavedDocument[]>();

  save(record: SaveDocumentRecord): Promise<SavedDocument> {
    const saved: SavedDocument = Object.freeze({
      id: record.id, companyId: record.companyId, ...record.document, versions: [record.version],
      linkedBusinessEventIds: [], createdAt: record.createdAt, createdBy: record.actorId,
    });
    const key = this.key(record.tenantId, record.companyId);
    this.records.set(key, [...(this.records.get(key) ?? []), saved]); return Promise.resolve(saved);
  }

  addVersion(record: AddDocumentVersionRecord): Promise<SavedDocument | null> {
    const key = this.key(record.tenantId, record.companyId); const items = this.records.get(key) ?? [];
    const index = items.findIndex((item) => item.id === record.document.id && item.currentVersion === record.document.currentVersion - 1);
    if (index < 0) return Promise.resolve(null);
    const saved = Object.freeze({ ...record.document, versions: [...record.document.versions, record.version] });
    const next = [...items]; next[index] = saved; this.records.set(key, next); return Promise.resolve(saved);
  }

  list(tenantId: string, companyId: string): Promise<readonly SavedDocument[]> {
    return Promise.resolve([...(this.records.get(this.key(tenantId, companyId)) ?? [])]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }

  find(tenantId: string, companyId: string, documentId: string): Promise<SavedDocument | null> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? []).find((item) => item.id === documentId) ?? null);
  }

  findByHash(tenantId: string, companyId: string, sha256: string): Promise<SavedDocument | null> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? [])
      .find((item) => item.versions.some((version) => version.sha256 === sha256)) ?? null);
  }

  linkBusinessEvent(record: LinkDocumentRecord): Promise<boolean> {
    const key = this.key(record.tenantId, record.companyId); const items = this.records.get(key) ?? [];
    const index = items.findIndex((item) => item.id === record.documentId); if (index < 0) return Promise.resolve(false);
    if (items[index]?.linkedBusinessEventIds.includes(record.businessEventId)) return Promise.resolve(false);
    const next = [...items]; next[index] = Object.freeze({
      ...items[index]!, linkedBusinessEventIds: [...items[index]!.linkedBusinessEventIds, record.businessEventId],
    });
    this.records.set(key, next); return Promise.resolve(true);
  }

  private key(tenantId: string, companyId: string) { return `${tenantId}:${companyId}`; }
}
