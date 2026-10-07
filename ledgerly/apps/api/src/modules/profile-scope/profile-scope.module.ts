import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module.js';
import { ProfileScopeService } from './application/profile-scope.service.js';
import { SCOPE_STORE } from './application/scope-store.js';
import { MemoryScopeStore } from './infrastructure/memory-scope.store.js';
import { PostgresScopeStore } from './infrastructure/postgres-scope.store.js';
import { ProfileScopeController } from './presentation/profile-scope.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryScopeStore, { provide: SCOPE_STORE, useExisting: MemoryScopeStore }]
  : [
      PostgresScopeStore,
      { provide: SCOPE_STORE, useExisting: PostgresScopeStore },
    ];

@Module({
  imports: [OrganizationModule],
  controllers: [ProfileScopeController],
  providers: [...storageProviders, ProfileScopeService],
  exports: [SCOPE_STORE],
})
export class ProfileScopeModule {}
