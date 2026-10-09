import { describe, expect, it } from 'vitest';
import { authCallbackInputSchema, authLoginInputSchema } from '../src/index.js';

describe('authentication contracts', () => {
  it('accepts only local return paths to prevent open redirects', () => {
    expect(authLoginInputSchema.parse({ returnTo: '/documents' }).returnTo).toBe('/documents');
    expect(authLoginInputSchema.safeParse({ returnTo: 'https://evil.example' }).success).toBe(false);
    expect(authLoginInputSchema.safeParse({ returnTo: '//evil.example' }).success).toBe(false);
  });

  it('bounds OIDC callback values', () => {
    expect(authCallbackInputSchema.safeParse({ code: 'code', state: 's'.repeat(43) }).success).toBe(true);
    expect(authCallbackInputSchema.safeParse({ code: '', state: 'short' }).success).toBe(false);
  });
});
