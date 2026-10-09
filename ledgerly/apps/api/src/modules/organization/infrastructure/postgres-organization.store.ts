import { Injectable } from '@nestjs/common';
import { CompanyStatus, type Company } from '@ledgerly/domain';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../../infrastructure/database/database.provider.js';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import { Inject } from '@nestjs/common';
import {
  appUsers,
  auditEvents,
  companies,
  outboxEvents,
  tenantMemberRoles,
  tenantMembers,
  tenants,
} from '../../../infrastructure/database/schema.js';
import type {
  BootstrapRecord,
  DeniedAccessRecord,
  OrganizationStore,
} from '../application/organization-store.js';

@Injectable()
export class PostgresOrganizationStore implements OrganizationStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async bootstrap(record: BootstrapRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        id: record.tenant.id,
        name: record.tenant.name,
        createdAt: record.tenant.createdAt,
        createdBy: record.tenant.createdBy,
        updatedAt: record.tenant.createdAt,
        updatedBy: record.tenant.createdBy,
      });
      await tx.insert(companies).values({
        id: record.company.id,
        tenantId: record.company.tenantId,
        name: record.company.name,
        unifiedSocialCreditCode: record.company.unifiedSocialCreditCode,
        provinceCode: record.company.provinceCode,
        cityCode: record.company.cityCode,
        status: record.company.status,
        version: record.company.version,
        createdAt: record.company.createdAt,
        createdBy: record.company.createdBy,
        updatedAt: record.company.createdAt,
        updatedBy: record.company.createdBy,
      });
      await tx.insert(appUsers).values({
        id: record.ownerUserId,
        status: 'active',
        displayName: '初始所有者',
        createdAt: record.tenant.createdAt,
        createdBy: record.ownerUserId,
        updatedAt: record.tenant.createdAt,
        updatedBy: record.ownerUserId,
      }).onConflictDoNothing();
      await tx.insert(tenantMembers).values({
        tenantId: record.tenant.id,
        userId: record.ownerUserId,
        role: 'owner',
        status: 'active',
        roles: ['tenant_owner'],
        companyIds: [record.company.id],
        activatedAt: record.tenant.createdAt,
        createdAt: record.tenant.createdAt,
        createdBy: record.ownerUserId,
        updatedAt: record.tenant.createdAt,
        updatedBy: record.ownerUserId,
      });
      await tx.insert(tenantMemberRoles).values({
        tenantId: record.tenant.id,
        userId: record.ownerUserId,
        role: 'tenant_owner',
        createdAt: record.tenant.createdAt,
        createdBy: record.ownerUserId,
        updatedAt: record.tenant.createdAt,
        updatedBy: record.ownerUserId,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(),
        tenantId: record.tenant.id,
        actorId: record.ownerUserId,
        action: 'organization.bootstrap',
        resourceType: 'company',
        resourceId: record.company.id,
        outcome: 'success',
        traceId: record.traceId,
        metadata: { companyName: record.company.name },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(),
        tenantId: record.tenant.id,
        eventType: 'company.created.v1',
        aggregateType: 'company',
        aggregateId: record.company.id,
        payload: { companyId: record.company.id, tenantId: record.tenant.id },
        occurredAt: record.company.createdAt,
      });
    });
  }

  async findCompany(tenantId: string, companyId: string): Promise<Company | null> {
    const [row] = await this.db
      .select()
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.id, companyId)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      unifiedSocialCreditCode: row.unifiedSocialCreditCode,
      provinceCode: row.provinceCode,
      cityCode: row.cityCode,
      status: row.status as CompanyStatus,
      version: row.version,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    };
  }

  async recordDeniedCompanyAccess(record: DeniedAccessRecord): Promise<void> {
    await this.db.insert(auditEvents).values({
      id: randomUUID(),
      tenantId: record.tenantId,
      actorId: record.actorId,
      action: 'company.read',
      resourceType: 'company',
      resourceId: record.companyId,
      outcome: 'denied',
      traceId: record.traceId,
      metadata: {},
    });
  }
}
