import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface AuthTransactionPayload {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly expiresAt: string;
  readonly expectedUserId?: string;
  readonly replaceSessionId?: string;
}

@Injectable()
export class AuthTransactionCodec {
  private readonly key: Buffer;

  constructor() {
    const configured = process.env['AUTH_COOKIE_KEY'];
    this.key = configured ? Buffer.from(configured, 'base64') : randomBytes(32);
    if (this.key.length !== 32) throw new Error('AUTH_COOKIE_KEY must be a base64 encoded 32-byte key');
  }

  seal(payload: AuthTransactionPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
  }

  open(value: string): AuthTransactionPayload {
    try {
      const [ivValue, ciphertextValue, tagValue] = value.split('.');
      if (!ivValue || !ciphertextValue || !tagValue) throw new Error('Malformed transaction');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const parsed = JSON.parse(plaintext) as Partial<AuthTransactionPayload>;
      if (!parsed.state || !parsed.nonce || !parsed.codeVerifier || !parsed.returnTo || !parsed.expiresAt) {
        throw new Error('Incomplete transaction');
      }
      return parsed as AuthTransactionPayload;
    } catch {
      throw new UnauthorizedException({ code: 'OIDC_TRANSACTION_INVALID', message: 'Login transaction is invalid' });
    }
  }
}
