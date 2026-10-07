import { Module } from '@nestjs/common';
import { OrganizationService } from './application/organization.service.js';
import { ORGANIZATION_STORE } from './application/organization-store.js';
import { PostgresOrganizationStore } from './infrastructure/postgres-organization.store.js';
import { MemoryOrganizationStore } from './infrastructure/memory-organization.store.js';
import { OrganizationController } from './presentation/organization.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [
      MemoryOrganizationStore,
      { provide: ORGANIZATION_STORE, useExisting: MemoryOrganizationStore },
    ]
  : [
      PostgresOrganizationStore,
      { provide: ORGANIZATION_STORE, useExisting: PostgresOrganizationStore },
    ];

@Module({
  controllers: [OrganizationController],
  providers: [
    ...storageProviders,
    OrganizationService,
  ],
  exports: [ORGANIZATION_STORE],
})
export class OrganizationModule {}
