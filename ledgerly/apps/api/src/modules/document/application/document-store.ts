import type { DocumentRecord } from '@ledgerly/domain';

export interface SavedDocumentVersion {
  readonly id: string; readonly versionNumber: number; readonly fileName: string;
  readonly mediaType: string; readonly byteSize: number; readonly sha256: string;
  readonly storageKey: string; readonly scanStatus: 'clean'; readonly scanEngine: string;
  readonly createdAt: Date; readonly createdBy: string;
}

export interface SavedDocument extends DocumentRecord {
  readonly id: string; readonly companyId: string; readonly versions: readonly SavedDocumentVersion[];
  readonly linkedBusinessEventIds: readonly string[]; readonly createdAt: Date; readonly createdBy: string;
}

export interface SaveDocumentRecord {
  readonly id: string; readonly tenantId: string; readonly companyId: string; readonly actorId: string;
  readonly traceId: string; readonly document: DocumentRecord; readonly version: SavedDocumentVersion; readonly createdAt: Date;
}

export interface AddDocumentVersionRecord {
  readonly tenantId: string; readonly companyId: string; readonly actorId: string; readonly traceId: string;
  readonly document: SavedDocument; readonly version: SavedDocumentVersion;
}

export interface LinkDocumentRecord {
  readonly id: string; readonly tenantId: string; readonly companyId: string; readonly actorId: string;
  readonly traceId: string; readonly documentId: string; readonly businessEventId: string; readonly createdAt: Date;
}

export const DOCUMENT_STORE = Symbol('DOCUMENT_STORE');
export interface DocumentStore {
  save(record: SaveDocumentRecord): Promise<SavedDocument>;
  addVersion(record: AddDocumentVersionRecord): Promise<SavedDocument | null>;
  list(tenantId: string, companyId: string): Promise<readonly SavedDocument[]>;
  find(tenantId: string, companyId: string, documentId: string): Promise<SavedDocument | null>;
  findByHash(tenantId: string, companyId: string, sha256: string): Promise<SavedDocument | null>;
  linkBusinessEvent(record: LinkDocumentRecord): Promise<boolean>;
}
