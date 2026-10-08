import { Injectable } from '@nestjs/common';
import { RuleReviewKind, RuleVersionStatus } from '@ledgerly/domain';
import type {
  PolicyRuleStore,
  SavedPolicySource,
  SavedRulePackage,
  SavedRuleVersion,
  SavePolicySourceRecord,
  SaveRulePackageRecord,
  SaveRuleVersionRecord,
  ReviewRuleVersionRecord,
  RecordRuleTestEvidenceRecord,
  ApproveRuleVersionRecord,
  ScheduleRuleVersionRecord,
  ActivateRuleVersionRecord,
  WithdrawRuleVersionRecord,
  SaveGoldenFixtureSetRecord,
  SavedGoldenFixtureSet,
  SaveGoldenFixtureExecutionRecord,
  SavedGoldenFixtureExecution,
} from '../application/policy-rule-store.js';

@Injectable()
export class MemoryPolicyRuleStore implements PolicyRuleStore {
  private readonly sources: SavedPolicySource[] = [];
  private readonly packages: SavedRulePackage[] = [];
  private readonly versions: SavedRuleVersion[] = [];
  private readonly fixtureSets: SavedGoldenFixtureSet[] = [];
  private readonly fixtureExecutions: SavedGoldenFixtureExecution[] = [];

  savePolicySource(record: SavePolicySourceRecord): Promise<SavedPolicySource> {
    const saved = Object.freeze({
      id: record.id, ...record.source, version: 1,
      createdAt: record.createdAt, createdBy: record.actorId,
    });
    this.sources.push(saved);
    return Promise.resolve(saved);
  }

  listPolicySources(): Promise<readonly SavedPolicySource[]> {
    return Promise.resolve([...this.sources].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber)));
  }

  policySourceExists(sourceId: string): Promise<boolean> {
    return Promise.resolve(this.sources.some((item) => item.id === sourceId));
  }

  policySourceDuplicate(documentNumber: string, contentHash: string): Promise<boolean> {
    return Promise.resolve(this.sources.some((item) =>
      item.documentNumber === documentNumber && item.contentHash === contentHash));
  }

  saveRulePackage(record: SaveRulePackageRecord): Promise<SavedRulePackage> {
    const saved = Object.freeze({
      id: record.id, ...record.rulePackage, version: 1,
      createdAt: record.createdAt, createdBy: record.actorId,
    });
    this.packages.push(saved);
    return Promise.resolve(saved);
  }

  listRulePackages(): Promise<readonly SavedRulePackage[]> {
    return Promise.resolve([...this.packages].sort((a, b) => a.code.localeCompare(b.code)));
  }

  findRulePackage(rulePackageId: string): Promise<SavedRulePackage | null> {
    return Promise.resolve(this.packages.find((item) => item.id === rulePackageId) ?? null);
  }

  rulePackageCodeExists(code: string): Promise<boolean> {
    return Promise.resolve(this.packages.some((item) => item.code === code));
  }

  saveRuleVersion(record: SaveRuleVersionRecord): Promise<SavedRuleVersion> {
    const saved = Object.freeze({
      id: record.id, rulePackageId: record.rulePackageId, ...record.ruleVersion,
      recordVersion: 1, createdAt: record.createdAt, createdBy: record.actorId,
    });
    this.versions.push(saved);
    return Promise.resolve(saved);
  }

  listRuleVersions(rulePackageId: string): Promise<readonly SavedRuleVersion[]> {
    return Promise.resolve(this.versions.filter((item) => item.rulePackageId === rulePackageId)
      .sort((a, b) => a.versionTag.localeCompare(b.versionTag)));
  }

  ruleVersionExists(rulePackageId: string, versionTag: string): Promise<boolean> {
    return Promise.resolve(this.versions.some((item) =>
      item.rulePackageId === rulePackageId && item.versionTag === versionTag));
  }

  findRuleVersion(rulePackageId: string, ruleVersionId: string): Promise<SavedRuleVersion | null> {
    return Promise.resolve(this.versions.find((item) =>
      item.rulePackageId === rulePackageId && item.id === ruleVersionId) ?? null);
  }

  reviewRuleVersion(record: ReviewRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const index = this.versions.findIndex((item) => item.id === record.current.id &&
      item.rulePackageId === record.current.rulePackageId);
    const stored = index >= 0 ? this.versions[index] : undefined;
    if (!stored || stored.recordVersion !== record.expectedVersion || stored.status !== record.current.status) {
      return Promise.resolve(null);
    }
    const updated: SavedRuleVersion = Object.freeze({
      ...stored,
      status: record.nextStatus,
      recordVersion: stored.recordVersion + 1,
      technicalReviewedBy: record.kind === RuleReviewKind.Technical ? record.actorId : stored.technicalReviewedBy,
      taxReviewedBy: record.kind === RuleReviewKind.Tax ? record.actorId : stored.taxReviewedBy,
    });
    this.versions[index] = updated;
    return Promise.resolve(updated);
  }

  recordRuleTestEvidence(record: RecordRuleTestEvidenceRecord): Promise<SavedRuleVersion | null> {
    const index = this.versions.findIndex((item) => item.id === record.current.id &&
      item.rulePackageId === record.current.rulePackageId);
    const stored = index >= 0 ? this.versions[index] : undefined;
    if (!stored || stored.recordVersion !== record.expectedVersion || stored.status !== record.current.status) {
      return Promise.resolve(null);
    }
    const updated: SavedRuleVersion = Object.freeze({
      ...stored, status: record.nextStatus, recordVersion: stored.recordVersion + 1,
      testedBy: record.actorId, testedAt: record.occurredAt,
    });
    this.versions[index] = updated;
    return Promise.resolve(updated);
  }

  saveGoldenFixtureSet(record: SaveGoldenFixtureSetRecord): Promise<SavedGoldenFixtureSet> {
    const saved = Object.freeze({
      id: record.id, ruleVersionId: record.current.id, ...record.fixtureSet,
      signedOffBy: record.actorId, signedOffAt: record.occurredAt,
    });
    this.fixtureSets.push(saved);
    return Promise.resolve(saved);
  }

  listGoldenFixtureSets(ruleVersionId: string): Promise<readonly SavedGoldenFixtureSet[]> {
    return Promise.resolve(this.fixtureSets.filter((item) => item.ruleVersionId === ruleVersionId)
      .sort((a, b) => a.fixtureSetVersion.localeCompare(b.fixtureSetVersion)));
  }

  findGoldenFixtureSet(ruleVersionId: string, fixtureSetVersion: string): Promise<SavedGoldenFixtureSet | null> {
    return Promise.resolve(this.fixtureSets.find((item) => item.ruleVersionId === ruleVersionId &&
      item.fixtureSetVersion === fixtureSetVersion) ?? null);
  }

  findGoldenFixtureSetById(ruleVersionId: string, fixtureSetId: string): Promise<SavedGoldenFixtureSet | null> {
    return Promise.resolve(this.fixtureSets.find((item) => item.ruleVersionId === ruleVersionId &&
      item.id === fixtureSetId) ?? null);
  }

  saveGoldenFixtureExecution(record: SaveGoldenFixtureExecutionRecord): Promise<SavedGoldenFixtureExecution> {
    this.fixtureExecutions.push(record.execution);
    return Promise.resolve(record.execution);
  }

  findSuccessfulGoldenFixtureExecution(
    ruleVersionId: string, fixtureSetId: string, artifactHash: string,
  ): Promise<SavedGoldenFixtureExecution | null> {
    return Promise.resolve([...this.fixtureExecutions].reverse().find((item) =>
      item.ruleVersionId === ruleVersionId && item.fixtureSetId === fixtureSetId &&
      item.artifactHash === artifactHash && item.status === 'passed') ?? null);
  }

  approveRuleVersion(record: ApproveRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const index = this.findCurrentIndex(record);
    if (index < 0) return Promise.resolve(null);
    const stored = this.versions[index]!;
    const updated: SavedRuleVersion = Object.freeze({
      ...stored, status: record.nextStatus, recordVersion: stored.recordVersion + 1,
      approvedBy: record.actorId, approvedAt: record.occurredAt,
    });
    this.versions[index] = updated;
    return Promise.resolve(updated);
  }

  scheduleRuleVersion(record: ScheduleRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const index = this.findCurrentIndex(record);
    if (index < 0) return Promise.resolve(null);
    const stored = this.versions[index]!;
    const updated: SavedRuleVersion = Object.freeze({
      ...stored, status: record.nextStatus, recordVersion: stored.recordVersion + 1,
      scheduledBy: record.actorId, scheduledAt: record.occurredAt, activationAt: record.activationAt,
    });
    this.versions[index] = updated;
    return Promise.resolve(updated);
  }

  activateRuleVersion(record: ActivateRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const index = this.findCurrentIndex(record);
    if (index < 0) return Promise.resolve(null);
    for (let candidateIndex = 0; candidateIndex < this.versions.length; candidateIndex += 1) {
      const candidate = this.versions[candidateIndex]!;
      if (candidate.rulePackageId === record.current.rulePackageId && candidate.id !== record.current.id &&
          candidate.status === RuleVersionStatus.Active) {
        this.versions[candidateIndex] = Object.freeze({
          ...candidate, status: RuleVersionStatus.Superseded,
          recordVersion: candidate.recordVersion + 1,
          supersededByRuleVersionId: record.current.id, supersededAt: record.occurredAt,
        });
      }
    }
    const stored = this.versions[index]!;
    const updated: SavedRuleVersion = Object.freeze({
      ...stored, status: record.nextStatus, recordVersion: stored.recordVersion + 1,
      activatedBy: record.actorId, activatedAt: record.occurredAt,
    });
    this.versions[index] = updated;
    return Promise.resolve(updated);
  }

  withdrawRuleVersion(record: WithdrawRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const index = this.findCurrentIndex(record);
    if (index < 0) return Promise.resolve(null);
    const stored = this.versions[index]!;
    const updated: SavedRuleVersion = Object.freeze({
      ...stored, status: record.nextStatus, recordVersion: stored.recordVersion + 1,
      withdrawnBy: record.actorId, withdrawnAt: record.occurredAt,
    });
    this.versions[index] = updated;
    return Promise.resolve(updated);
  }

  private findCurrentIndex(record: ApproveRuleVersionRecord): number {
    return this.versions.findIndex((item) => item.id === record.current.id &&
      item.rulePackageId === record.current.rulePackageId &&
      item.recordVersion === record.expectedVersion && item.status === record.current.status);
  }
}
