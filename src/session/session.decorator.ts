import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { RequestWithSession } from '../common/structured-logger';
import type { Role, SessionRecord } from '../common/types';

export const ROLES_METADATA_KEY = 'ihda_required_roles';

export const Roles = (...roles: readonly Role[]) => SetMetadata(ROLES_METADATA_KEY, roles);

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionRecord => {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    if (!req.syntheticSession) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: 'Valid synthetic session required.',
      });
    }
    return req.syntheticSession;
  },
);
