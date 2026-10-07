import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DocumentStatus, DocumentType } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import { auditEvents, documents, documentVersions, evidenceLinks, outboxEvents } from '../../../infrastructure/database/schema.js';
import type {
  AddDocumentVersionRecord, DocumentStore, LinkDocumentRecord, SavedDocument,
  SavedDocumentVersion, SaveDocumentRecord,
} from '../application/document-store.js';

@Injectable()
export class PostgresDocumentStore implements DocumentStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveDocumentRecord): Promise<SavedDocument> {
    await this.db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: record.id, tenantId: record.tenantId, companyId: record.companyId,
        type: record.document.type, title: record.document.title, accountingMonth: record.document.accountingMonth,
        status: record.document.status, currentVersion: record.document.currentVersion,
        createdAt: record.createdAt, createdBy: record.actorId, updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(documentVersions).values(this.versionValues(record.tenantId, record.companyId, record.id, record.version));
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'document.upload', resourceType: 'document', resourceId: record.id,
        outcome: 'success', traceId: record.traceId,
        metadata: { type: record.document.type, sha256: record.version.sha256, byteSize: record.version.byteSize },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'document.uploaded.v1',
        aggregateType: 'document', aggregateId: record.id,
        payload: { documentId: record.id, companyId: record.companyId, versionNumber: 1 },
        occurredAt: record.createdAt,
      });
    });
    return {
      id: record.id, companyId: record.companyId, ...record.document, versions: [record.version],
      linkedBusinessEventIds: [], createdAt: record.createdAt, createdBy: record.actorId,
    };
  }

  async addVersion(record: AddDocumentVersionRecord): Promise<SavedDocument | null> {
    const previous = record.document.currentVersion - 1;
    const succeeded = await this.db.transaction(async (tx) => {
      const [updated] = await tx.update(documents).set({
        currentVersion: record.document.currentVersion, updatedAt: record.version.createdAt, updatedBy: record.actorId,
      }).where(and(
        eq(documents.tenantId, record.tenantId), eq(documents.companyId, record.companyId),
        eq(documents.id, record.document.id), eq(documents.currentVersion, previous),
      )).returning({ id: documents.id });
      if (!updated) return false;
      await tx.insert(documentVersions).values(this.versionValues(record.tenantId, record.companyId, record.document.id, record.version));
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'document.version.add', resourceType: 'document', resourceId: record.document.id,
        outcome: 'success', traceId: record.traceId,
        metadata: { versionNumber: record.version.versionNumber, sha256: record.version.sha256 },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'document.version_added.v1',
        aggregateType: 'document', aggregateId: record.document.id,
        payload: { documentId: record.document.id, companyId: record.companyId, versionNumber: record.version.versionNumber },
        occurredAt: record.version.createdAt,
      });
      return true;
    });
    return succeeded ? this.find(record.tenantId, record.companyId, record.document.id) : null;
  }

  async list(tenantId: string, companyId: string): Promise<readonly SavedDocument[]> {
    const rows = await this.db.select().from(documents).where(and(
      eq(documents.tenantId, tenantId), eq(documents.companyId, companyId),
    )).orderBy(desc(documents.createdAt));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async find(tenantId: string, companyId: string, documentId: string): Promise<SavedDocument | null> {
    const [row] = await this.db.select().from(documents).where(and(
      eq(documents.tenantId, tenantId), eq(documents.companyId, companyId), eq(documents.id, documentId),
    )).limit(1);
    return row ? this.hydrate(row) : null;
  }

  async findByHash(tenantId: string, companyId: string, sha256: string): Promise<SavedDocument | null> {
    const [version] = await this.db.select({ documentId: documentVersions.documentId }).from(documentVersions).where(and(
      eq(documentVersions.tenantId, tenantId), eq(documentVersions.companyId, companyId), eq(documentVersions.sha256, sha256),
    )).limit(1);
    return version ? this.find(tenantId, companyId, version.documentId) : null;
  }

  async linkBusinessEvent(record: LinkDocumentRecord): Promise<boolean> {
    const [inserted] = await this.db.transaction(async (tx) => {
      const rows = await tx.insert(evidenceLinks).values({
        id: record.id, tenantId: record.tenantId, companyId: record.companyId,
        documentId: record.documentId, businessEventId: record.businessEventId,
        createdAt: record.createdAt, createdBy: record.actorId,
      }).onConflictDoNothing().returning({ id: evidenceLinks.id });
      if (!rows[0]) return [];
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'document.link_business_event', resourceType: 'document', resourceId: record.documentId,
        outcome: 'success', traceId: record.traceId, metadata: { businessEventId: record.businessEventId },
      });
      return rows;
    });
    return inserted !== undefined;
  }

  private async hydrate(row: typeof documents.$inferSelect): Promise<SavedDocument> {
    const [versions, links] = await Promise.all([
      this.db.select().from(documentVersions).where(eq(documentVersions.documentId, row.id)).orderBy(asc(documentVersions.versionNumber)),
      this.db.select({ businessEventId: evidenceLinks.businessEventId }).from(evidenceLinks).where(eq(evidenceLinks.documentId, row.id)),
    ]);
    return {
      id: row.id, companyId: row.companyId, type: row.type as DocumentType, title: row.title,
      accountingMonth: row.accountingMonth, status: row.status as DocumentStatus,
      currentVersion: row.currentVersion, versions: versions.map((version) => ({
        id: version.id, versionNumber: version.versionNumber, fileName: version.fileName,
        mediaType: version.mediaType, byteSize: version.byteSize, sha256: version.sha256,
        storageKey: version.storageKey, scanStatus: version.scanStatus as 'clean', scanEngine: version.scanEngine,
        createdAt: version.createdAt, createdBy: version.createdBy,
      })),
      linkedBusinessEventIds: links.map((link) => link.businessEventId),
      createdAt: row.createdAt, createdBy: row.createdBy,
    };
  }

  private versionValues(tenantId: string, companyId: string, documentId: string, version: SavedDocumentVersion) {
    return {
      id: version.id, tenantId, companyId, documentId, versionNumber: version.versionNumber,
      fileName: version.fileName, mediaType: version.mediaType, byteSize: version.byteSize,
      sha256: version.sha256, storageKey: version.storageKey, scanStatus: version.scanStatus, scanEngine: version.scanEngine,
      createdAt: version.createdAt, createdBy: version.createdBy,
    };
  }
}
