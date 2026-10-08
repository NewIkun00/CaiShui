import { describe, expect, it } from 'vitest';
import {
  policySourceInputSchema,
  ruleVersionResponseSchema,
} from '@ledgerly/contracts';
import { zodOpenApiSchema } from '../src/shared/zod-openapi.js';

describe('Zod OpenAPI bridge', () => {
  it('preserves required fields and string constraints for request schemas', () => {
    const schema = zodOpenApiSchema(policySourceInputSchema, 'input');
    const serialized = JSON.stringify(schema);

    expect(schema.type).toBe('object');
    expect(schema.required).toContain('officialUrl');
    expect(serialized).toContain('"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"}');
  });

  it('preserves response status unions and identifiers', () => {
    const schema = zodOpenApiSchema(ruleVersionResponseSchema, 'output');
    const serialized = JSON.stringify(schema);

    expect(schema.allOf).toHaveLength(2);
    expect(serialized).toContain('"id":{"type":"string","format":"uuid","pattern":');
    expect(serialized).toContain('"status":{"type":"string","enum":["draft"');
    expect(serialized).toContain('"active"');
    expect(serialized).toContain('"withdrawn"');
  });
});
