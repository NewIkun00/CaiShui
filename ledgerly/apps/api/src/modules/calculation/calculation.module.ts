import { Module } from '@nestjs/common';
import { BusinessEventModule } from '../business-event/business-event.module.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { PolicyRuleModule } from '../policy-rule/policy-rule.module.js';
import { ProfileScopeModule } from '../profile-scope/profile-scope.module.js';
import { CALCULATION_STORE } from './application/calculation-store.js';
import { CalculationService } from './application/calculation.service.js';
import { MemoryCalculationStore } from './infrastructure/memory-calculation.store.js';
import { PostgresCalculationStore } from './infrastructure/postgres-calculation.store.js';
import { CalculationController } from './presentation/calculation.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryCalculationStore, { provide: CALCULATION_STORE, useExisting: MemoryCalculationStore }]
  : [PostgresCalculationStore, { provide: CALCULATION_STORE, useExisting: PostgresCalculationStore }];

@Module({
  imports: [OrganizationModule, ProfileScopeModule, BusinessEventModule, PolicyRuleModule],
  controllers: [CalculationController],
  providers: [...storageProviders, CalculationService],
  exports: [CALCULATION_STORE],
})
export class CalculationModule {}
