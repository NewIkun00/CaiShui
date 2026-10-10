import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedFastifyRequest } from '../../../shared/authenticated-request.js';
import { authMode } from '../infrastructure/auth-mode.js';
import { STEP_UP_REQUIRED } from './step-up.decorator.js';

const MAX_STEP_UP_AGE_MS = 15 * 60_000;

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(STEP_UP_REQUIRED, [context.getHandler(), context.getClass()])) return true;
    if (authMode() === 'development-headers') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const auth = request.authentication;
    const hasMfa = auth?.authMethods.some((method) => method === 'otp' || method === 'webauthn') ?? false;
    const fresh = auth ? Date.now() - auth.authenticatedAt.getTime() <= MAX_STEP_UP_AGE_MS : false;
    if (!hasMfa || !fresh) {
      throw new ForbiddenException({
        code: 'STEP_UP_REQUIRED',
        message: 'Fresh multi-factor authentication is required for this operation',
      });
    }
    return true;
  }
}
