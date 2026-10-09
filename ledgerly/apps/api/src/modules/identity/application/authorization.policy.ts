import type { CustomerRole, OperationsRole } from '@ledgerly/domain';

export type CustomerPermission = 'customer.read' | 'customer.write';
export type OperationsResource = 'policy' | 'review';
export type OperationsPermission = `${OperationsResource}.read` | `${OperationsResource}.manage`;

const customerGrants: Readonly<Record<CustomerRole, readonly CustomerPermission[]>> = {
  tenant_owner: ['customer.read', 'customer.write'],
  tenant_admin: ['customer.read', 'customer.write'],
  bookkeeper: ['customer.read', 'customer.write'],
  member: ['customer.read'],
};

const operationsGrants: Readonly<Record<OperationsRole, readonly OperationsPermission[]>> = {
  support_readonly: ['policy.read', 'review.read'],
  accounting_reviewer: ['review.read', 'review.manage'],
  tax_reviewer: ['policy.read', 'review.read', 'review.manage'],
  rule_editor: ['policy.read', 'policy.manage'],
  rule_approver: ['policy.read', 'policy.manage'],
  security_auditor: ['policy.read', 'review.read'],
  platform_admin: ['policy.read', 'policy.manage', 'review.read', 'review.manage'],
};

export function customerRolesPermit(roles: readonly CustomerRole[], permission: CustomerPermission): boolean {
  return roles.some((role) => customerGrants[role].includes(permission));
}

export function operationsRolesPermit(roles: readonly OperationsRole[], permission: OperationsPermission): boolean {
  return roles.some((role) => operationsGrants[role].includes(permission));
}
