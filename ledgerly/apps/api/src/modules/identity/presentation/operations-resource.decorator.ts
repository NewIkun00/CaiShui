import { SetMetadata } from '@nestjs/common';
import type { OperationsResource } from '../application/authorization.policy.js';

export const OPERATIONS_RESOURCE = 'ledgerly.operations-resource';
export const OperationsAccess = (resource: OperationsResource) => SetMetadata(OPERATIONS_RESOURCE, resource);
