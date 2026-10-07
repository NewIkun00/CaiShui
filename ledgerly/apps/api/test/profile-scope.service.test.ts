import { describe, expect, it } from 'vitest';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';

const actorId = '10000000-0000-4000-8000-000000000001';

describe('ProfileScopeService', () => {
  it('evaluates and persists a supported company profile', async () => {
    const organizations = new MemoryOrganizationStore();
    const organizationService = new OrganizationService(organizations);
    const created = await organizationService.bootstrap({
      tenantName: '测试租户',
      company: {
        name: '常州市测试科技有限公司',
        unifiedSocialCreditCode: '913204001234567890',
        provinceCode: '32',
        cityCode: '3204',
      },
    }, { actorId, traceId: 'create-trace' });
    const service = new ProfileScopeService(organizations, new MemoryScopeStore());
    const result = await service.evaluate(created.company.id, {
      entityType: 'one_person_llc',
      vatTaxpayerStatus: 'small_scale',
      vatFilingCycle: 'quarterly',
      incomeTaxCollection: 'audit',
      industry: 'modern_service',
      hasInventory: false,
      hasBranches: false,
      hasImportExport: false,
      hasForeignCurrency: false,
      hasSpecialVatFivePercent: false,
      hasDifferenceTax: false,
      hasCrossRegionPrepayment: false,
      hasComplexPayroll: false,
      hasShareholderTransactions: false,
      hasComplexTaxAdjustments: false,
      sourceDocumentsComplete: true,
    }, { actorId, tenantId: created.tenantId, traceId: 'scope-trace' });
    expect(result).toMatchObject({ companyId: created.company.id, decision: 'green' });
  });

  it('does not evaluate a company outside the current tenant', async () => {
    const service = new ProfileScopeService(
      new MemoryOrganizationStore(),
      new MemoryScopeStore(),
    );
    await expect(service.evaluate('30000000-0000-4000-8000-000000000003', {
      entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly',
      incomeTaxCollection: 'audit', industry: 'modern_service', hasInventory: false,
      hasBranches: false, hasImportExport: false, hasForeignCurrency: false,
      hasSpecialVatFivePercent: false, hasDifferenceTax: false, hasCrossRegionPrepayment: false,
      hasComplexPayroll: false, hasShareholderTransactions: false,
      hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
    }, { actorId, tenantId: '20000000-0000-4000-8000-000000000002', traceId: 'scope-trace' }))
      .rejects.toMatchObject({ status: 404 });
  });
});
