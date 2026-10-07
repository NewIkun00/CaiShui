import { Module } from '@nestjs/common';
import { BusinessEventModule } from '../business-event/business-event.module.js';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { DOCUMENT_STORE } from './application/document-store.js';
import { DocumentService } from './application/document.service.js';
import { FILE_SCANNER } from './application/file-scanner.js';
import { OBJECT_STORAGE } from './application/object-storage.js';
import { LocalObjectStorage } from './infrastructure/local-object-storage.js';
import { MemoryDocumentStore } from './infrastructure/memory-document.store.js';
import { MemoryObjectStorage } from './infrastructure/memory-object-storage.js';
import { PostgresDocumentStore } from './infrastructure/postgres-document.store.js';
import { SignatureFileScanner } from './infrastructure/signature-file-scanner.js';
import { DocumentController } from './presentation/document.controller.js';

const memory = process.env['STORAGE_MODE'] === 'memory';
const storageProviders = memory
  ? [
      MemoryDocumentStore, { provide: DOCUMENT_STORE, useExisting: MemoryDocumentStore },
      MemoryObjectStorage, { provide: OBJECT_STORAGE, useExisting: MemoryObjectStorage },
    ]
  : [
      PostgresDocumentStore, { provide: DOCUMENT_STORE, useExisting: PostgresDocumentStore },
      LocalObjectStorage, { provide: OBJECT_STORAGE, useExisting: LocalObjectStorage },
    ];

@Module({
  imports: [LedgerSetupModule, BusinessEventModule], controllers: [DocumentController],
  providers: [
    ...storageProviders, SignatureFileScanner,
    { provide: FILE_SCANNER, useExisting: SignatureFileScanner }, DocumentService,
  ],
})
export class DocumentModule {}
