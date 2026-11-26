import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithSession } from '../common/structured-logger';
import type { Role } from '../common/types';
import { ROLES_METADATA_KEY } from './session.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const session = req.syntheticSession;
    if (!session || !requiredRoles.includes(session.role)) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Operator role is required to perform this action.',
      });
    }

    return true;
  }
}
