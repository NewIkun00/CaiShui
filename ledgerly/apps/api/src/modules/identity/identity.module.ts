import { Module } from '@nestjs/common';
import { IDENTITY_STORE } from './application/identity-store.js';
import { IdentityService } from './application/identity.service.js';
import { MemoryIdentityStore } from './infrastructure/memory-identity.store.js';
import { PostgresIdentityStore } from './infrastructure/postgres-identity.store.js';
import { IdentityController } from './presentation/identity.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryIdentityStore, { provide: IDENTITY_STORE, useExisting: MemoryIdentityStore }]
  : [PostgresIdentityStore, { provide: IDENTITY_STORE, useExisting: PostgresIdentityStore }];

@Module({
  controllers: [IdentityController],
  providers: [...storageProviders, IdentityService],
  exports: [IDENTITY_STORE, IdentityService],
})
export class IdentityModule {}
