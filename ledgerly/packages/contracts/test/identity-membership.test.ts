import { describe, expect, it } from 'vitest';
import {
  tenantInvitationInputSchema,
  tenantInvitationResponseSchema,
  tenantMemberResponseSchema,
  operationsRoleAssignmentInputSchema,
  operationsRoleAssignmentResponseSchema,
  operationsRoleRevocationInputSchema,
} from '../src/index.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const companyId = '20000000-0000-4000-8000-000000000001';
const userId = '30000000-0000-4000-8000-000000000001';
const time = '2026-10-09T00:00:00.000Z';

describe('identity membership contracts', () => {
  it('accepts bounded roles, company scopes and invitation expiry', () => {
    expect(tenantInvitationInputSchema.parse({
      identifier: 'member@example.com', roles: ['bookkeeper'], companyIds: [companyId], expiresInHours: 48,
    })).toMatchObject({ roles: ['bookkeeper'], companyIds: [companyId] });
    expect(tenantInvitationInputSchema.safeParse({
      identifier: 'member@example.com', roles: [], companyIds: [], expiresInHours: 48,
    }).success).toBe(false);
  });

  it('keeps secret hashes out of invitation and member API responses', () => {
    const invitation = tenantInvitationResponseSchema.parse({
      id: userId, tenantId, identifierHint: 'm***@example.com', roles: ['member'], companyIds: [],
      status: 'pending', expiresAt: time, createdAt: time, createdBy: userId, developmentToken: 'x'.repeat(43),
    });
    expect(invitation).not.toHaveProperty('tokenHash');
    expect(tenantMemberResponseSchema.parse({
      tenantId, userId, displayName: '测试成员', status: 'active', roles: ['member'], companyIds: [companyId],
      version: 1, activatedAt: time,
    }).status).toBe('active');
  });

  it('bounds platform role assignment and revocation evidence', () => {
    expect(operationsRoleAssignmentInputSchema.parse({ userId, role: 'rule_editor' }).role).toBe('rule_editor');
    expect(operationsRoleAssignmentInputSchema.safeParse({ userId, role: 'tenant_owner' }).success).toBe(false);
    expect(operationsRoleRevocationInputSchema.safeParse({ expectedVersion: 1, reason: 'x' }).success).toBe(false);
    expect(operationsRoleAssignmentResponseSchema.parse({
      userId, displayName: '规则编辑', role: 'rule_editor', status: 'active', version: 1,
      createdAt: time, createdBy: userId, updatedAt: time, updatedBy: userId,
    }).status).toBe('active');
  });
});
