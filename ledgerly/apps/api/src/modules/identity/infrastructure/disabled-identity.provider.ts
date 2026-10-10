import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizationCodeInput, AuthorizationUrlInput, IdentityProviderPort } from '../application/identity-provider.port.js';

@Injectable()
export class DisabledIdentityProvider implements IdentityProviderPort {
  authorizationUrl(input: AuthorizationUrlInput): string {
    void input;
    throw new ServiceUnavailableException('OIDC provider is disabled in development-headers mode');
  }
  exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<never> {
    void input;
    return Promise.reject(new ServiceUnavailableException('OIDC provider is disabled in development-headers mode'));
  }
  verifyAccessToken(token: string): Promise<never> {
    void token;
    return Promise.reject(new ServiceUnavailableException('OIDC provider is disabled in development-headers mode'));
  }
  revokeSession(issuer: string, providerSessionId: string): Promise<never> {
    void issuer;
    void providerSessionId;
    return Promise.reject(new ServiceUnavailableException('OIDC provider is disabled in development-headers mode'));
  }
}
