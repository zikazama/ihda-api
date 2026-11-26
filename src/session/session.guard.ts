import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestWithSession } from '../common/structured-logger';
import { SESSION_COOKIE_NAME, SessionService } from './session.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const authHeader = req.headers.authorization;

    let rawToken: unknown = undefined;
    if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
      const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
      if (!match?.[1]) {
        throw new UnauthorizedException({
          error: 'UNAUTHORIZED',
          message: 'Authorization header must use Bearer <sessionId>.',
        });
      }
      rawToken = match[1].trim();
    } else {
      const cookies: unknown = req.cookies;
      if (cookies !== null && typeof cookies === 'object' && SESSION_COOKIE_NAME in cookies) {
        rawToken = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];
      }
    }

    const session = this.sessionService.resolveSession(rawToken);
    if (!session) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: 'Valid synthetic session required.',
      });
    }

    req.syntheticSession = session;
    return true;
  }
}
