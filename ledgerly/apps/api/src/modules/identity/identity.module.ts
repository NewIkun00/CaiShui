import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthenticationService } from './application/authentication.service.js';
import { IDENTITY_PROVIDER } from './application/identity-provider.port.js';
import { IDENTITY_STORE } from './application/identity-store.js';
import { IdentityService } from './application/identity.service.js';
import { MemoryIdentityStore } from './infrastructure/memory-identity.store.js';
import { PostgresIdentityStore } from './infrastructure/postgres-identity.store.js';
import { IdentityController } from './presentation/identity.controller.js';
import { AuthenticationController } from './presentation/authentication.controller.js';
import { SessionAuthGuard } from './presentation/session-auth.guard.js';
import { AuthTransactionCodec } from './infrastructure/auth-transaction.codec.js';
import { authMode } from './infrastructure/auth-mode.js';
import { DisabledIdentityProvider } from './infrastructure/disabled-identity.provider.js';
import { KeycloakOidcProvider } from './infrastructure/keycloak-oidc.provider.js';
import { RbacGuard } from './presentation/rbac.guard.js';
import { StepUpGuard } from './presentation/step-up.guard.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryIdentityStore, { provide: IDENTITY_STORE, useExisting: MemoryIdentityStore }]
  : [PostgresIdentityStore, { provide: IDENTITY_STORE, useExisting: PostgresIdentityStore }];

const identityProvider = authMode() === 'oidc'
  ? [KeycloakOidcProvider, { provide: IDENTITY_PROVIDER, useExisting: KeycloakOidcProvider }]
  : [DisabledIdentityProvider, { provide: IDENTITY_PROVIDER, useExisting: DisabledIdentityProvider }];

@Module({
  controllers: [AuthenticationController, IdentityController],
  providers: [
    ...storageProviders,
    ...identityProvider,
    IdentityService,
    AuthenticationService,
    AuthTransactionCodec,
    SessionAuthGuard,
    { provide: APP_GUARD, useExisting: SessionAuthGuard },
    RbacGuard,
    { provide: APP_GUARD, useExisting: RbacGuard },
    StepUpGuard,
    { provide: APP_GUARD, useExisting: StepUpGuard },
  ],
  exports: [IDENTITY_STORE, IdentityService, AuthenticationService],
})
export class IdentityModule {}
