import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FilingClosureInput, FilingEvidenceInput } from '@ledgerly/contracts';
import { assertFilingClosable, FilingReceiptError } from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import { DOCUMENT_STORE, type DocumentStore } from '../../document/application/document-store.js';
import {
  ORGANIZATION_STORE,
  type OrganizationStore,
} from '../../organization/application/organization-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import {
  FILING_STORE,
  type FilingClosure,
  type FilingEvidence,
  type FilingStore,
} from './filing-store.js';

@Injectable()
export class FilingEvidenceService {
  constructor(
    @Inject(FILING_STORE) private readonly store: FilingStore,
    @Inject(ORGANIZATION_STORE) private readonly organizations: OrganizationStore,
    @Inject(DOCUMENT_STORE) private readonly documents: DocumentStore,
  ) {}

  async archive(
    companyId: string,
    packageId: string,
    input: FilingEvidenceInput,
    context: RequestContext,
  ) {
    const tenantId = await this.company(companyId, context),
      filingPackage = await this.store.findPackage(tenantId, companyId, packageId);
    if (!filingPackage) throw new NotFoundException('Filing package not found');
    if (filingPackage.status !== 'frozen')
      throw new ConflictException({
        code: 'FILING_EVIDENCE_REQUIRES_FROZEN_PACKAGE',
        message: 'Evidence can be archived only against a frozen filing package',
      });
    if (await this.store.findClosureByPackage(tenantId, companyId, packageId))
      throw new ConflictException({
        code: 'FILING_PACKAGE_ALREADY_CLOSED',
        message: 'Closed filing evidence cannot be changed',
      });
    const document = await this.documents.find(tenantId, companyId, input.documentId),
      version = document?.versions.find((item) => item.versionNumber === input.documentVersion);
    if (!document || !version) throw new NotFoundException('Evidence document version not found');
    if (version.sha256 !== input.documentHash)
      throw new ConflictException({
        code: 'FILING_EVIDENCE_DOCUMENT_HASH_MISMATCH',
        message: 'Evidence document hash does not match the immutable document version',
      });
    const now = new Date(),
      base = {
        companyId,
        filingTaskId: filingPackage.snapshot.filingTaskId,
        filingPackageId: filingPackage.id,
        kind: input.kind,
        documentId: input.documentId,
        documentVersion: input.documentVersion,
        documentHash: input.documentHash,
        externalReference: input.externalReference,
        occurredAt: new Date(input.occurredAt),
        ...('reportedResultHash' in input ? { reportedResultHash: input.reportedResultHash } : {}),
        note: input.note,
      },
      contentHash = sha256(base),
      current = await this.store.listEvidence(tenantId, companyId, packageId),
      existing = current.find((item) => item.contentHash === contentHash);
    if (existing) return existing;
    const evidence: FilingEvidence = {
      id: randomUUID(),
      ...base,
      contentHash,
      createdAt: now,
      createdBy: context.actorId,
    };
    return this.store.createEvidence({ tenantId, evidence, traceId: context.traceId });
  }

  async listEvidence(companyId: string, packageId: string, context: RequestContext) {
    const tenantId = await this.company(companyId, context);
    if (!(await this.store.findPackage(tenantId, companyId, packageId)))
      throw new NotFoundException('Filing package not found');
    return this.store.listEvidence(tenantId, companyId, packageId);
  }

  async close(
    companyId: string,
    packageId: string,
    input: FilingClosureInput,
    context: RequestContext,
  ) {
    const tenantId = await this.company(companyId, context),
      filingPackage = await this.store.findPackage(tenantId, companyId, packageId);
    if (!filingPackage) throw new NotFoundException('Filing package not found');
    const existing = await this.store.findClosureByPackage(tenantId, companyId, packageId);
    if (existing) return existing;
    const task = await this.store.findTask(
      tenantId,
      companyId,
      filingPackage.snapshot.filingTaskId,
    );
    if (!task) throw new NotFoundException('Filing task not found');
    const evidence = await this.store.listEvidence(tenantId, companyId, packageId),
      receipts = evidence.filter((item) => item.kind === 'filing_receipt'),
      proofs = evidence.filter((item) => item.kind === 'tax_payment_proof'),
      openAdjustments=(await this.store.listAdjustments(tenantId,companyId)).filter(item=>item.sourcePackageId===packageId&&(item.status==='open'||item.status==='in_review')).length;
    try {
      assertFilingClosable({
        taskStatus: task.status,
        packageStatus: filingPackage.status,
        expectedResultHash: filingPackage.snapshot.resultHash,
        filingReceiptResultHashes: receipts.flatMap((item) =>
          item.reportedResultHash ? [item.reportedResultHash] : [],
        ),
        filingReceiptCount: receipts.length,
        paymentProofCount: proofs.length,
        openAdjustmentWorkOrderCount: openAdjustments,
      });
    } catch (error) {
      if (error instanceof FilingReceiptError)
        throw new ConflictException({
          code: 'FILING_CLOSURE_BLOCKED',
          message: error.message,
          blockers: error.blockers,
        });
      throw error;
    }
    const resultHash = filingPackage.snapshot.resultHash!;
    const closedAt = new Date(),
      base = {
        companyId,
        filingTaskId: task.id,
        filingPackageId: filingPackage.id,
        packageContentHash: filingPackage.contentHash,
        resultHash,
        evidenceIds: evidence.map((item) => item.id).sort(),
        note: input.note,
        closedAt,
        closedBy: context.actorId,
      },
      closure: FilingClosure = {
        id: randomUUID(),
        ...base,
        contentHash: sha256({ ...base, closedAt: closedAt.toISOString() }),
      };
    const created = await this.store.createClosure({ tenantId, closure, traceId: context.traceId });
    if (!created)
      throw new ConflictException({
        code: 'FILING_PACKAGE_ALREADY_CLOSED',
        message: 'Filing package was closed concurrently',
      });
    return created;
  }

  async listClosures(companyId: string, context: RequestContext) {
    return this.store.listClosures(await this.company(companyId, context), companyId);
  }

  private async company(companyId: string, context: RequestContext) {
    if (!context.tenantId || !(await this.organizations.findCompany(context.tenantId, companyId)))
      throw new NotFoundException('Company not found');
    return context.tenantId;
  }
}

function sha256(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
