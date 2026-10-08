import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { RuleReviewKind, RuleVersionStatus, TaxType, type RuleApplicability, type RuleParameterValue } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  auditEvents,
  policySources,
  rulePackages,
  ruleVersionPolicySources,
  ruleVersionReviews,
  ruleTestEvidence,
  ruleVersionApprovals,
  ruleReleaseSchedules,
  ruleReleaseEvents,
  goldenFixtureSets,
  goldenFixtures,
  goldenFixtureExecutions,
  ruleShadowRuns,
  ruleVersions,
} from '../../../infrastructure/database/schema.js';
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
  SaveRuleShadowRunRecord,
  SavedRuleShadowRun,
} from '../application/policy-rule-store.js';

@Injectable()
export class PostgresPolicyRuleStore implements PolicyRuleStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async savePolicySource(record: SavePolicySourceRecord): Promise<SavedPolicySource> {
    await this.db.transaction(async (tx) => {
      await tx.insert(policySources).values({
        id: record.id, documentNumber: record.source.documentNumber, title: record.source.title,
        officialUrl: record.source.officialUrl, issuingAuthority: record.source.issuingAuthority,
        publishedOn: record.source.publishedOn, effectiveFrom: record.source.effectiveFrom,
        effectiveTo: record.source.effectiveTo ?? null, summary: record.source.summary,
        contentHash: record.source.contentHash, lastVerifiedOn: record.source.lastVerifiedOn,
        capturedAt: record.createdAt, createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await this.audit(tx, record.actorId, record.traceId, 'policy_source.create', 'policy_source', record.id,
        { documentNumber: record.source.documentNumber, contentHash: record.source.contentHash });
    });
    return { id: record.id, ...record.source, version: 1, createdAt: record.createdAt, createdBy: record.actorId };
  }

  async listPolicySources(): Promise<readonly SavedPolicySource[]> {
    const rows = await this.db.select().from(policySources).orderBy(asc(policySources.documentNumber));
    return rows.map((row) => ({
      id: row.id, documentNumber: row.documentNumber, title: row.title, officialUrl: row.officialUrl,
      issuingAuthority: row.issuingAuthority, publishedOn: row.publishedOn, effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? undefined, summary: row.summary, contentHash: row.contentHash,
      lastVerifiedOn: row.lastVerifiedOn, version: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
    }));
  }

  async policySourceExists(sourceId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: policySources.id }).from(policySources)
      .where(eq(policySources.id, sourceId)).limit(1);
    return row !== undefined;
  }

  async policySourceDuplicate(documentNumber: string, contentHash: string): Promise<boolean> {
    const [row] = await this.db.select({ id: policySources.id }).from(policySources)
      .where(and(eq(policySources.documentNumber, documentNumber), eq(policySources.contentHash, contentHash))).limit(1);
    return row !== undefined;
  }

  async saveRulePackage(record: SaveRulePackageRecord): Promise<SavedRulePackage> {
    await this.db.transaction(async (tx) => {
      await tx.insert(rulePackages).values({
        id: record.id, code: record.rulePackage.code, name: record.rulePackage.name,
        taxType: record.rulePackage.taxType, jurisdictions: record.rulePackage.jurisdictions,
        description: record.rulePackage.description, createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await this.audit(tx, record.actorId, record.traceId, 'rule_package.create', 'rule_package', record.id,
        { code: record.rulePackage.code, taxType: record.rulePackage.taxType });
    });
    return { id: record.id, ...record.rulePackage, version: 1, createdAt: record.createdAt, createdBy: record.actorId };
  }

  async listRulePackages(): Promise<readonly SavedRulePackage[]> {
    const rows = await this.db.select().from(rulePackages).orderBy(asc(rulePackages.code));
    return rows.map((row) => ({
      id: row.id, code: row.code, name: row.name, taxType: row.taxType as TaxType,
      jurisdictions: row.jurisdictions as string[], description: row.description,
      version: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
    }));
  }

  async findRulePackage(rulePackageId: string): Promise<SavedRulePackage | null> {
    const [row] = await this.db.select().from(rulePackages).where(eq(rulePackages.id, rulePackageId)).limit(1);
    return row ? {
      id: row.id, code: row.code, name: row.name, taxType: row.taxType as TaxType,
      jurisdictions: row.jurisdictions as string[], description: row.description,
      version: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
    } : null;
  }

  async rulePackageCodeExists(code: string): Promise<boolean> {
    const [row] = await this.db.select({ id: rulePackages.id }).from(rulePackages)
      .where(eq(rulePackages.code, code)).limit(1);
    return row !== undefined;
  }

  async saveRuleVersion(record: SaveRuleVersionRecord): Promise<SavedRuleVersion> {
    await this.db.transaction(async (tx) => {
      await tx.insert(ruleVersions).values({
        id: record.id, rulePackageId: record.rulePackageId, versionTag: record.ruleVersion.versionTag,
        effectiveFrom: record.ruleVersion.effectiveFrom, effectiveTo: record.ruleVersion.effectiveTo ?? null,
        applicability: record.ruleVersion.applicability, calculationImplementation: record.ruleVersion.calculationImplementation,
        parameters: record.ruleVersion.parameters, explanation: record.ruleVersion.explanation,
        contentHash: record.ruleVersion.contentHash, status: record.ruleVersion.status,
        createdAt: record.createdAt, createdBy: record.actorId, updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(ruleVersionPolicySources).values(record.ruleVersion.sourceIds.map((policySourceId) => ({
        ruleVersionId: record.id, policySourceId,
      })));
      await this.audit(tx, record.actorId, record.traceId, 'rule_version.create', 'rule_version', record.id,
        { rulePackageId: record.rulePackageId, versionTag: record.ruleVersion.versionTag,
          contentHash: record.ruleVersion.contentHash, status: record.ruleVersion.status });
    });
    return {
      id: record.id, rulePackageId: record.rulePackageId, ...record.ruleVersion,
      recordVersion: 1, createdAt: record.createdAt, createdBy: record.actorId,
    };
  }

  async listRuleVersions(rulePackageId: string): Promise<readonly SavedRuleVersion[]> {
    const rows = await this.db.select().from(ruleVersions)
      .where(eq(ruleVersions.rulePackageId, rulePackageId)).orderBy(asc(ruleVersions.versionTag));
    const result: SavedRuleVersion[] = [];
    for (const row of rows) {
      const sourceRows = await this.db.select({ id: ruleVersionPolicySources.policySourceId })
        .from(ruleVersionPolicySources).where(eq(ruleVersionPolicySources.ruleVersionId, row.id));
      result.push({
        id: row.id, rulePackageId: row.rulePackageId, versionTag: row.versionTag,
        effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo ?? undefined,
        sourceIds: sourceRows.map((item) => item.id).sort(),
        applicability: row.applicability as RuleApplicability,
        calculationImplementation: row.calculationImplementation,
        parameters: row.parameters as Record<string, RuleParameterValue>, explanation: row.explanation,
        contentHash: row.contentHash, status: row.status as RuleVersionStatus,
        recordVersion: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
        technicalReviewedBy: row.technicalReviewedBy ?? undefined,
        taxReviewedBy: row.taxReviewedBy ?? undefined,
        testedBy: row.testedBy ?? undefined,
        testedAt: row.testedAt ?? undefined,
        approvedBy: row.approvedBy ?? undefined,
        approvedAt: row.approvedAt ?? undefined,
        scheduledBy: row.scheduledBy ?? undefined,
        scheduledAt: row.scheduledAt ?? undefined,
        activationAt: row.activationAt ?? undefined,
        activatedBy: row.activatedBy ?? undefined,
        activatedAt: row.activatedAt ?? undefined,
        supersededByRuleVersionId: row.supersededByRuleVersionId ?? undefined,
        supersededAt: row.supersededAt ?? undefined,
        withdrawnBy: row.withdrawnBy ?? undefined,
        withdrawnAt: row.withdrawnAt ?? undefined,
      });
    }
    return result;
  }

  async ruleVersionExists(rulePackageId: string, versionTag: string): Promise<boolean> {
    const [row] = await this.db.select({ id: ruleVersions.id }).from(ruleVersions)
      .where(and(eq(ruleVersions.rulePackageId, rulePackageId), eq(ruleVersions.versionTag, versionTag))).limit(1);
    return row !== undefined;
  }

  async findRuleVersion(rulePackageId: string, ruleVersionId: string): Promise<SavedRuleVersion | null> {
    const [row] = await this.db.select().from(ruleVersions)
      .where(and(eq(ruleVersions.rulePackageId, rulePackageId), eq(ruleVersions.id, ruleVersionId))).limit(1);
    if (!row) return null;
    const sourceRows = await this.db.select({ id: ruleVersionPolicySources.policySourceId })
      .from(ruleVersionPolicySources).where(eq(ruleVersionPolicySources.ruleVersionId, row.id));
    return {
      id: row.id, rulePackageId: row.rulePackageId, versionTag: row.versionTag,
      effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo ?? undefined,
      sourceIds: sourceRows.map((item) => item.id).sort(),
      applicability: row.applicability as RuleApplicability,
      calculationImplementation: row.calculationImplementation,
      parameters: row.parameters as Record<string, RuleParameterValue>, explanation: row.explanation,
      contentHash: row.contentHash, status: row.status as RuleVersionStatus,
      recordVersion: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
      technicalReviewedBy: row.technicalReviewedBy ?? undefined,
      taxReviewedBy: row.taxReviewedBy ?? undefined,
      testedBy: row.testedBy ?? undefined,
      testedAt: row.testedAt ?? undefined,
      approvedBy: row.approvedBy ?? undefined,
      approvedAt: row.approvedAt ?? undefined,
      scheduledBy: row.scheduledBy ?? undefined,
      scheduledAt: row.scheduledAt ?? undefined,
      activationAt: row.activationAt ?? undefined,
      activatedBy: row.activatedBy ?? undefined,
      activatedAt: row.activatedAt ?? undefined,
      supersededByRuleVersionId: row.supersededByRuleVersionId ?? undefined,
      supersededAt: row.supersededAt ?? undefined,
      withdrawnBy: row.withdrawnBy ?? undefined,
      withdrawnAt: row.withdrawnAt ?? undefined,
    };
  }

  async reviewRuleVersion(record: ReviewRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(ruleVersions).set({
        status: record.nextStatus,
        version: record.expectedVersion + 1,
        technicalReviewedBy: record.kind === RuleReviewKind.Technical ? record.actorId : record.current.technicalReviewedBy,
        taxReviewedBy: record.kind === RuleReviewKind.Tax ? record.actorId : record.current.taxReviewedBy,
        updatedAt: record.occurredAt,
        updatedBy: record.actorId,
      }).where(and(
        eq(ruleVersions.id, record.current.id),
        eq(ruleVersions.rulePackageId, record.current.rulePackageId),
        eq(ruleVersions.version, record.expectedVersion),
        eq(ruleVersions.status, record.current.status),
      )).returning({ id: ruleVersions.id });
      if (!row) return false;
      await tx.insert(ruleVersionReviews).values({
        id: randomUUID(), ruleVersionId: record.current.id, reviewKind: record.kind,
        fromStatus: record.current.status, toStatus: record.nextStatus, note: record.note,
        reviewedBy: record.actorId, reviewedAt: record.occurredAt,
      });
      await this.audit(tx, record.actorId, record.traceId, `rule_version.review.${record.kind}`,
        'rule_version', record.current.id, {
          rulePackageId: record.current.rulePackageId, fromStatus: record.current.status,
          toStatus: record.nextStatus, expectedVersion: record.expectedVersion,
        });
      return true;
    });
    if (!updated) return null;
    return {
      ...record.current,
      status: record.nextStatus,
      recordVersion: record.expectedVersion + 1,
      technicalReviewedBy: record.kind === RuleReviewKind.Technical ? record.actorId : record.current.technicalReviewedBy,
      taxReviewedBy: record.kind === RuleReviewKind.Tax ? record.actorId : record.current.taxReviewedBy,
    };
  }

  async recordRuleTestEvidence(record: RecordRuleTestEvidenceRecord): Promise<SavedRuleVersion | null> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(ruleVersions).set({
        status: record.nextStatus, version: record.expectedVersion + 1,
        testedBy: record.actorId, testedAt: record.occurredAt,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(ruleVersions.id, record.current.id),
        eq(ruleVersions.rulePackageId, record.current.rulePackageId),
        eq(ruleVersions.version, record.expectedVersion),
        eq(ruleVersions.status, record.current.status),
      )).returning({ id: ruleVersions.id });
      if (!row) return false;
      await tx.insert(ruleTestEvidence).values({
        id: randomUUID(), ruleVersionId: record.current.id,
        fixtureSetVersion: record.evidence.fixtureSetVersion,
        totalFixtures: record.evidence.totalFixtures, passedFixtures: record.evidence.passedFixtures,
        coveredScenarios: record.evidence.coveredScenarios,
        artifactHash: record.evidence.artifactHash, note: record.evidence.note,
        signedOffBy: record.actorId, signedOffAt: record.occurredAt,
      });
      await this.audit(tx, record.actorId, record.traceId, 'rule_version.test_evidence.record',
        'rule_version', record.current.id, {
          rulePackageId: record.current.rulePackageId,
          fixtureSetVersion: record.evidence.fixtureSetVersion,
          totalFixtures: record.evidence.totalFixtures,
          artifactHash: record.evidence.artifactHash,
          fromStatus: record.current.status,
          toStatus: record.nextStatus,
        });
      return true;
    });
    if (!updated) return null;
    return {
      ...record.current, status: record.nextStatus, recordVersion: record.expectedVersion + 1,
      testedBy: record.actorId, testedAt: record.occurredAt,
    };
  }

  async saveGoldenFixtureSet(record: SaveGoldenFixtureSetRecord): Promise<SavedGoldenFixtureSet> {
    await this.db.transaction(async (tx) => {
      await tx.insert(goldenFixtureSets).values({
        id: record.id, ruleVersionId: record.current.id,
        fixtureSetVersion: record.fixtureSet.fixtureSetVersion, contentHash: record.fixtureSet.contentHash,
        redactionAttested: record.fixtureSet.redactionAttested,
        professionalNote: record.fixtureSet.professionalNote,
        signedOffBy: record.actorId, signedOffAt: record.occurredAt,
      });
      await tx.insert(goldenFixtures).values(record.fixtureSet.fixtures.map((fixture) => ({
        id: randomUUID(), fixtureSetId: record.id, caseId: fixture.caseId, scenario: fixture.scenario,
        input: fixture.input, expected: fixture.expected, explanation: fixture.explanation,
      })));
      await this.audit(tx, record.actorId, record.traceId, 'golden_fixture_set.create',
        'rule_version', record.current.id, {
          fixtureSetId: record.id, fixtureSetVersion: record.fixtureSet.fixtureSetVersion,
          fixtureCount: record.fixtureSet.fixtures.length, contentHash: record.fixtureSet.contentHash,
        });
    });
    return {
      id: record.id, ruleVersionId: record.current.id, ...record.fixtureSet,
      signedOffBy: record.actorId, signedOffAt: record.occurredAt,
    };
  }

  async listGoldenFixtureSets(ruleVersionId: string): Promise<readonly SavedGoldenFixtureSet[]> {
    const rows = await this.db.select().from(goldenFixtureSets)
      .where(eq(goldenFixtureSets.ruleVersionId, ruleVersionId))
      .orderBy(asc(goldenFixtureSets.fixtureSetVersion));
    const result: SavedGoldenFixtureSet[] = [];
    for (const row of rows) result.push(await this.hydrateFixtureSet(row));
    return result;
  }

  async findGoldenFixtureSet(
    ruleVersionId: string, fixtureSetVersion: string,
  ): Promise<SavedGoldenFixtureSet | null> {
    const [row] = await this.db.select().from(goldenFixtureSets).where(and(
      eq(goldenFixtureSets.ruleVersionId, ruleVersionId),
      eq(goldenFixtureSets.fixtureSetVersion, fixtureSetVersion),
    )).limit(1);
    return row ? this.hydrateFixtureSet(row) : null;
  }

  async findGoldenFixtureSetById(
    ruleVersionId: string, fixtureSetId: string,
  ): Promise<SavedGoldenFixtureSet | null> {
    const [row] = await this.db.select().from(goldenFixtureSets).where(and(
      eq(goldenFixtureSets.ruleVersionId, ruleVersionId), eq(goldenFixtureSets.id, fixtureSetId),
    )).limit(1);
    return row ? this.hydrateFixtureSet(row) : null;
  }

  async saveGoldenFixtureExecution(
    record: SaveGoldenFixtureExecutionRecord,
  ): Promise<SavedGoldenFixtureExecution> {
    await this.db.transaction(async (tx) => {
      await tx.insert(goldenFixtureExecutions).values({
        id: record.execution.id, ruleVersionId: record.execution.ruleVersionId,
        fixtureSetId: record.execution.fixtureSetId, implementationKey: record.execution.implementationKey,
        status: record.execution.status, totalFixtures: record.execution.totalFixtures,
        passedFixtures: record.execution.passedFixtures, artifactHash: record.execution.artifactHash,
        results: record.execution.results, executedBy: record.execution.executedBy,
        executedAt: record.execution.executedAt,
      });
      await this.audit(tx, record.execution.executedBy, record.traceId, 'golden_fixture_set.execute',
        'rule_version', record.execution.ruleVersionId, {
          fixtureSetId: record.execution.fixtureSetId, implementationKey: record.execution.implementationKey,
          status: record.execution.status, totalFixtures: record.execution.totalFixtures,
          passedFixtures: record.execution.passedFixtures, artifactHash: record.execution.artifactHash,
        });
    });
    return record.execution;
  }

  async findSuccessfulGoldenFixtureExecution(
    ruleVersionId: string, fixtureSetId: string, artifactHash: string,
  ): Promise<SavedGoldenFixtureExecution | null> {
    const [row] = await this.db.select().from(goldenFixtureExecutions).where(and(
      eq(goldenFixtureExecutions.ruleVersionId, ruleVersionId),
      eq(goldenFixtureExecutions.fixtureSetId, fixtureSetId),
      eq(goldenFixtureExecutions.artifactHash, artifactHash),
      eq(goldenFixtureExecutions.status, 'passed'),
    )).limit(1);
    return row ? {
      id: row.id, ruleVersionId: row.ruleVersionId, fixtureSetId: row.fixtureSetId,
      implementationKey: row.implementationKey, status: row.status as 'passed',
      totalFixtures: row.totalFixtures, passedFixtures: row.passedFixtures,
      artifactHash: row.artifactHash,
      results: row.results as SavedGoldenFixtureExecution['results'],
      executedBy: row.executedBy, executedAt: row.executedAt,
    } : null;
  }

  async saveRuleShadowRun(
    record: SaveRuleShadowRunRecord,
  ): Promise<{readonly run:SavedRuleShadowRun;readonly created:boolean}> {
    const created=await this.db.transaction(async(tx)=>{
      const [inserted]=await tx.insert(ruleShadowRuns).values({
        id:record.run.id,rulePackageId:record.run.rulePackageId,
        baselineRuleVersionId:record.run.baselineRuleVersionId,
        candidateRuleVersionId:record.run.candidateRuleVersionId,fixtureSetId:record.run.fixtureSetId,
        fixtureSetContentHash:record.run.fixtureSetContentHash,
        baselineImplementationKey:record.run.baselineImplementationKey,
        candidateImplementationKey:record.run.candidateImplementationKey,status:record.run.status,
        totalFixtures:record.run.totalFixtures,identicalFixtures:record.run.identicalFixtures,
        changedFixtures:record.run.changedFixtures,failedFixtures:record.run.failedFixtures,
        artifactHash:record.run.artifactHash,differences:record.run.differences,
        executedBy:record.run.executedBy,executedAt:record.run.executedAt,
      }).onConflictDoNothing().returning({id:ruleShadowRuns.id});
      if(!inserted)return false;
      await this.audit(tx,record.run.executedBy,record.traceId,'rule_shadow_run.execute','rule_package',record.run.rulePackageId,{
        shadowRunId:record.run.id,baselineRuleVersionId:record.run.baselineRuleVersionId,
        candidateRuleVersionId:record.run.candidateRuleVersionId,fixtureSetId:record.run.fixtureSetId,
        status:record.run.status,artifactHash:record.run.artifactHash,
      });
      return true;
    });
    if(created)return{run:record.run,created:true};
    const [existing]=await this.db.select().from(ruleShadowRuns).where(and(
      eq(ruleShadowRuns.rulePackageId,record.run.rulePackageId),eq(ruleShadowRuns.artifactHash,record.run.artifactHash),
    )).limit(1);
    if(!existing)throw new Error('Shadow run conflict did not return the existing record');
    return{run:this.presentShadowRun(existing),created:false};
  }

  async listRuleShadowRuns(rulePackageId: string): Promise<readonly SavedRuleShadowRun[]> {
    const rows=await this.db.select().from(ruleShadowRuns).where(eq(ruleShadowRuns.rulePackageId,rulePackageId))
      .orderBy(desc(ruleShadowRuns.executedAt));
    return rows.map((row)=>this.presentShadowRun(row));
  }

  async findRuleShadowRun(rulePackageId: string, runId: string): Promise<SavedRuleShadowRun | null> {
    const [row]=await this.db.select().from(ruleShadowRuns).where(and(
      eq(ruleShadowRuns.rulePackageId,rulePackageId),eq(ruleShadowRuns.id,runId),
    )).limit(1);
    return row?this.presentShadowRun(row):null;
  }

  async approveRuleVersion(record: ApproveRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(ruleVersions).set({
        status: record.nextStatus, version: record.expectedVersion + 1,
        approvedBy: record.actorId, approvedAt: record.occurredAt,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(ruleVersions.id, record.current.id),
        eq(ruleVersions.rulePackageId, record.current.rulePackageId),
        eq(ruleVersions.version, record.expectedVersion),
        eq(ruleVersions.status, record.current.status),
      )).returning({ id: ruleVersions.id });
      if (!row) return false;
      await tx.insert(ruleVersionApprovals).values({
        id: randomUUID(), ruleVersionId: record.current.id, note: record.note,
        approvedBy: record.actorId, approvedAt: record.occurredAt,
      });
      await this.audit(tx, record.actorId, record.traceId, 'rule_version.approve',
        'rule_version', record.current.id, {
          rulePackageId: record.current.rulePackageId, fromStatus: record.current.status,
          toStatus: record.nextStatus, expectedVersion: record.expectedVersion,
        });
      return true;
    });
    if (!updated) return null;
    return {
      ...record.current, status: record.nextStatus, recordVersion: record.expectedVersion + 1,
      approvedBy: record.actorId, approvedAt: record.occurredAt,
    };
  }

  async scheduleRuleVersion(record: ScheduleRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(ruleVersions).set({
        status: record.nextStatus, version: record.expectedVersion + 1,
        scheduledBy: record.actorId, scheduledAt: record.occurredAt, activationAt: record.activationAt,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(ruleVersions.id, record.current.id),
        eq(ruleVersions.rulePackageId, record.current.rulePackageId),
        eq(ruleVersions.version, record.expectedVersion),
        eq(ruleVersions.status, record.current.status),
      )).returning({ id: ruleVersions.id });
      if (!row) return false;
      await tx.insert(ruleReleaseSchedules).values({
        id: randomUUID(), ruleVersionId: record.current.id, activationAt: record.activationAt,
        note: record.note, scheduledBy: record.actorId, scheduledAt: record.occurredAt,
      });
      await this.audit(tx, record.actorId, record.traceId, 'rule_version.schedule',
        'rule_version', record.current.id, {
          rulePackageId: record.current.rulePackageId, activationAt: record.activationAt.toISOString(),
          fromStatus: record.current.status, toStatus: record.nextStatus,
          expectedVersion: record.expectedVersion,
        });
      return true;
    });
    if (!updated) return null;
    return {
      ...record.current, status: record.nextStatus, recordVersion: record.expectedVersion + 1,
      scheduledBy: record.actorId, scheduledAt: record.occurredAt, activationAt: record.activationAt,
    };
  }

  async activateRuleVersion(record: ActivateRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const updated = await this.db.transaction(async (tx) => {
      const locked = await tx.select({
        id: ruleVersions.id, status: ruleVersions.status, version: ruleVersions.version,
      }).from(ruleVersions).where(eq(ruleVersions.rulePackageId, record.current.rulePackageId))
        .orderBy(asc(ruleVersions.id)).for('update');
      const target = locked.find((item) => item.id === record.current.id);
      if (!target || target.version !== record.expectedVersion ||
          (target.status as RuleVersionStatus) !== record.current.status) return false;

      const activeVersions = locked.filter((item) =>
        item.id !== record.current.id && (item.status as RuleVersionStatus) === RuleVersionStatus.Active);
      for (const active of activeVersions) {
        await tx.update(ruleVersions).set({
          status: RuleVersionStatus.Superseded, version: active.version + 1,
          supersededByRuleVersionId: record.current.id, supersededAt: record.occurredAt,
          updatedAt: record.occurredAt, updatedBy: record.actorId,
        }).where(and(eq(ruleVersions.id, active.id), eq(ruleVersions.version, active.version)));
        await tx.insert(ruleReleaseEvents).values({
          id: randomUUID(), ruleVersionId: active.id, eventType: 'supersession',
          fromStatus: RuleVersionStatus.Active, toStatus: RuleVersionStatus.Superseded,
          relatedRuleVersionId: record.current.id, note: record.note,
          actedBy: record.actorId, actedAt: record.occurredAt,
        });
      }

      await tx.update(ruleVersions).set({
        status: record.nextStatus, version: record.expectedVersion + 1,
        activatedBy: record.actorId, activatedAt: record.occurredAt,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(eq(ruleVersions.id, record.current.id));
      await tx.insert(ruleReleaseEvents).values({
        id: randomUUID(), ruleVersionId: record.current.id, eventType: 'activation',
        fromStatus: record.current.status, toStatus: record.nextStatus,
        relatedRuleVersionId: null, note: record.note,
        actedBy: record.actorId, actedAt: record.occurredAt,
      });
      await this.audit(tx, record.actorId, record.traceId, 'rule_version.activate',
        'rule_version', record.current.id, {
          rulePackageId: record.current.rulePackageId,
          supersededRuleVersionIds: activeVersions.map((item) => item.id),
          fromStatus: record.current.status, toStatus: record.nextStatus,
          expectedVersion: record.expectedVersion,
        });
      return true;
    });
    if (!updated) return null;
    return {
      ...record.current, status: record.nextStatus, recordVersion: record.expectedVersion + 1,
      activatedBy: record.actorId, activatedAt: record.occurredAt,
    };
  }

  async withdrawRuleVersion(record: WithdrawRuleVersionRecord): Promise<SavedRuleVersion | null> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(ruleVersions).set({
        status: record.nextStatus, version: record.expectedVersion + 1,
        withdrawnBy: record.actorId, withdrawnAt: record.occurredAt,
        updatedAt: record.occurredAt, updatedBy: record.actorId,
      }).where(and(
        eq(ruleVersions.id, record.current.id),
        eq(ruleVersions.rulePackageId, record.current.rulePackageId),
        eq(ruleVersions.version, record.expectedVersion),
        eq(ruleVersions.status, record.current.status),
      )).returning({ id: ruleVersions.id });
      if (!row) return false;
      await tx.insert(ruleReleaseEvents).values({
        id: randomUUID(), ruleVersionId: record.current.id, eventType: 'withdrawal',
        fromStatus: record.current.status, toStatus: record.nextStatus,
        relatedRuleVersionId: null, note: record.note,
        actedBy: record.actorId, actedAt: record.occurredAt,
      });
      await this.audit(tx, record.actorId, record.traceId, 'rule_version.withdraw',
        'rule_version', record.current.id, {
          rulePackageId: record.current.rulePackageId, fromStatus: record.current.status,
          toStatus: record.nextStatus, expectedVersion: record.expectedVersion,
        });
      return true;
    });
    if (!updated) return null;
    return {
      ...record.current, status: record.nextStatus, recordVersion: record.expectedVersion + 1,
      withdrawnBy: record.actorId, withdrawnAt: record.occurredAt,
    };
  }

  private async audit(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0], actorId: string, traceId: string,
    action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditEvents).values({
      id: randomUUID(), tenantId: null, actorId, action, resourceType, resourceId,
      outcome: 'success', traceId, metadata,
    });
  }

  private async hydrateFixtureSet(
    row: typeof goldenFixtureSets.$inferSelect,
  ): Promise<SavedGoldenFixtureSet> {
    const fixtures = await this.db.select().from(goldenFixtures)
      .where(eq(goldenFixtures.fixtureSetId, row.id)).orderBy(asc(goldenFixtures.caseId));
    return {
      id: row.id, ruleVersionId: row.ruleVersionId, fixtureSetVersion: row.fixtureSetVersion,
      contentHash: row.contentHash, redactionAttested: row.redactionAttested,
      professionalNote: row.professionalNote,
      fixtures: fixtures.map((fixture) => ({
        caseId: fixture.caseId, scenario: fixture.scenario as SavedGoldenFixtureSet['fixtures'][number]['scenario'],
        input: fixture.input as Record<string, unknown>, expected: fixture.expected as Record<string, unknown>,
        explanation: fixture.explanation,
      })),
      signedOffBy: row.signedOffBy, signedOffAt: row.signedOffAt,
    };
  }

  private presentShadowRun(row: typeof ruleShadowRuns.$inferSelect): SavedRuleShadowRun {
    return{
      id:row.id,rulePackageId:row.rulePackageId,baselineRuleVersionId:row.baselineRuleVersionId,
      candidateRuleVersionId:row.candidateRuleVersionId,fixtureSetId:row.fixtureSetId,
      fixtureSetContentHash:row.fixtureSetContentHash,baselineImplementationKey:row.baselineImplementationKey,
      candidateImplementationKey:row.candidateImplementationKey,
      status:row.status as SavedRuleShadowRun['status'],totalFixtures:row.totalFixtures,
      identicalFixtures:row.identicalFixtures,changedFixtures:row.changedFixtures,
      failedFixtures:row.failedFixtures,artifactHash:row.artifactHash,
      differences:row.differences as SavedRuleShadowRun['differences'],
      executedBy:row.executedBy,executedAt:row.executedAt,
    };
  }
}
