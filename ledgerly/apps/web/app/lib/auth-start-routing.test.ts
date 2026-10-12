import { describe, expect, it } from 'vitest';
import { safeAuthReturnTo } from './auth-start-routing';

describe('authentication start routing', () => {
  it('keeps a local application return path', () => {
    expect(safeAuthReturnTo('/onboarding?source=register', '/dashboard')).toBe(
      '/onboarding?source=register',
    );
  });

  it('rejects external, protocol-relative and oversized destinations', () => {
    expect(safeAuthReturnTo('https://evil.example', '/onboarding')).toBe('/onboarding');
    expect(safeAuthReturnTo('//evil.example', '/onboarding')).toBe('/onboarding');
    expect(safeAuthReturnTo(`/${'a'.repeat(500)}`, '/onboarding')).toBe('/onboarding');
  });
});
