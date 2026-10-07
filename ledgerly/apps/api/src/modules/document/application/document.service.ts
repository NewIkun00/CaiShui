import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentUploadRequest, DocumentVersionUploadRequest } from '@ledgerly/contracts';
import { createDocument, DocumentError, DocumentType, nextDocumentVersion } from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import { BUSINESS_EVENT_STORE, type BusinessEventStore } from '../../business-event/application/business-event-store.js';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { DOCUMENT_STORE, type DocumentStore, type SavedDocument, type SavedDocumentVersion } from './document-store.js';
import { FILE_SCANNER, type FileScanner } from './file-scanner.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';

const maximumBytes = 5_000_000;
export interface DocumentUploadResult { readonly document: SavedDocument; readonly duplicate: boolean; }

@Injectable()
export class DocumentService {
  constructor(
    @Inject(LEDGER_SETUP_STORE) private readonly ledgerSetups: LedgerSetupStore,
    @Inject(BUSINESS_EVENT_STORE) private readonly events: BusinessEventStore,
    @Inject(DOCUMENT_STORE) private readonly documents: DocumentStore,
    @Inject(OBJECT_STORAGE) private readonly objects: ObjectStorage,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
  ) {}

  async upload(companyId: string, input: DocumentUploadRequest, context: RequestContext): Promise<DocumentUploadResult> {
    const tenantId = await this.requireLedger(companyId, context);
    const file = await this.prepareFile(input.fileName, input.mediaType, input.contentBase64);
    const duplicate = await this.documents.findByHash(tenantId, companyId, file.sha256);
    if (duplicate) return { document: duplicate, duplicate: true };
    let document;
    try { document = createDocument({ type: input.type as DocumentType, title: input.title, accountingMonth: input.accountingMonth }); }
    catch (error: unknown) {
      if (error instanceof DocumentError) throw new BadRequestException({ code: 'INVALID_DOCUMENT', message: error.message });
      throw error;
    }
    const documentId = randomUUID(); const version = this.version(documentId, 1, input.fileName, input.mediaType, file, context);
    await this.objects.put(version.storageKey, file.content, input.mediaType);
    try {
      return { document: await this.documents.save({
        id: documentId, tenantId, companyId, actorId: context.actorId, traceId: context.traceId,
        document, version, createdAt: version.createdAt,
      }), duplicate: false };
    } catch (error: unknown) { await this.objects.delete(version.storageKey); throw error; }
  }

  async addVersion(companyId: string, documentId: string, input: DocumentVersionUploadRequest, context: RequestContext): Promise<DocumentUploadResult> {
    const tenantId = await this.requireLedger(companyId, context);
    const existing = await this.documents.find(tenantId, companyId, documentId);
    if (!existing) throw new NotFoundException('Document not found');
    const file = await this.prepareFile(input.fileName, input.mediaType, input.contentBase64);
    const duplicate = await this.documents.findByHash(tenantId, companyId, file.sha256);
    if (duplicate?.id === documentId) return { document: existing, duplicate: true };
    if (duplicate) throw new ConflictException({ code: 'FILE_ALREADY_ARCHIVED', message: 'The same file is already archived in another document' });
    const next = nextDocumentVersion(existing);
    const version = this.version(documentId, next.currentVersion, input.fileName, input.mediaType, file, context);
    await this.objects.put(version.storageKey, file.content, input.mediaType);
    try {
      const saved = await this.documents.addVersion({
        tenantId, companyId, actorId: context.actorId, traceId: context.traceId,
        document: { ...existing, ...next }, version,
      });
      if (!saved) throw new ConflictException({ code: 'DOCUMENT_VERSION_CONFLICT', message: 'Document changed; reload and retry' });
      return { document: saved, duplicate: false };
    } catch (error: unknown) { await this.objects.delete(version.storageKey); throw error; }
  }

  async list(companyId: string, context: RequestContext): Promise<readonly SavedDocument[]> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    return this.documents.list(context.tenantId, companyId);
  }

  async content(companyId: string, documentId: string, versionId: string, context: RequestContext) {
    if (!context.tenantId) throw new NotFoundException('Document not found');
    const document = await this.documents.find(context.tenantId, companyId, documentId);
    const version = document?.versions.find((item) => item.id === versionId);
    if (!document || !version) throw new NotFoundException('Document version not found');
    const content = await this.objects.get(version.storageKey);
    if (!content) throw new NotFoundException('Document content not found');
    return { fileName: version.fileName, mediaType: version.mediaType, contentBase64: Buffer.from(content).toString('base64') };
  }

  async linkBusinessEvent(companyId: string, documentId: string, eventId: string, context: RequestContext): Promise<SavedDocument> {
    if (!context.tenantId) throw new NotFoundException('Document not found');
    const document = await this.documents.find(context.tenantId, companyId, documentId);
    if (!document) throw new NotFoundException('Document not found');
    if (!await this.events.find(context.tenantId, companyId, eventId)) throw new NotFoundException('Business event not found');
    await this.documents.linkBusinessEvent({
      id: randomUUID(), tenantId: context.tenantId, companyId, actorId: context.actorId,
      traceId: context.traceId, documentId, businessEventId: eventId, createdAt: new Date(),
    });
    const saved = await this.documents.find(context.tenantId, companyId, documentId);
    if (!saved) throw new NotFoundException('Document not found');
    return saved;
  }

  private async requireLedger(companyId: string, context: RequestContext): Promise<string> {
    if (!context.tenantId || !await this.ledgerSetups.find(context.tenantId, companyId)) {
      throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    }
    return context.tenantId;
  }

  private async prepareFile(fileName: string, mediaType: string, encoded: string) {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
      throw new BadRequestException({ code: 'INVALID_FILE_NAME', message: 'File name cannot contain path separators' });
    }
    const content = Buffer.from(encoded, 'base64');
    if (content.length === 0 || content.length > maximumBytes || content.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
      throw new BadRequestException({ code: 'INVALID_FILE', message: 'File must be valid Base64 and no larger than 5 MB' });
    }
    const scan = await this.scanner.scan(content, fileName);
    if (scan.status !== 'clean') throw new BadRequestException({ code: 'FILE_REJECTED', message: 'File failed the security scan' });
    return { content, sha256: createHash('sha256').update(content).digest('hex'), mediaType, scanEngine: scan.engine };
  }

  private version(documentId: string, versionNumber: number, fileName: string, mediaType: string,
    file: { content: Uint8Array; sha256: string; scanEngine: string }, context: RequestContext): SavedDocumentVersion {
    const id = randomUUID();
    return {
      id, versionNumber, fileName, mediaType, byteSize: file.content.byteLength, sha256: file.sha256,
      storageKey: `${documentId}/${id}`, scanStatus: 'clean', scanEngine: file.scanEngine,
      createdAt: new Date(), createdBy: context.actorId,
    };
  }
}
