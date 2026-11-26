import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SessionRecord } from './types';

export interface RequestWithSession extends Request {
  syntheticSession?: SessionRecord;
  requestId?: string;
}

export function logJson(level: 'info' | 'warn' | 'error', event: string, meta: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'ihda-api',
    event,
    ...meta,
  });
  process.stdout.write(line + '\n');
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req: RequestWithSession, res: Response, next: NextFunction): void {
    const startMs = Date.now();
    const incomingId = req.headers['x-request-id'];
    const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0 ? incomingId : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      if (req.path === '/health') {
        return;
      }
      logJson(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startMs,
        tenantId: req.syntheticSession?.tenantId ?? null,
        role: req.syntheticSession?.role ?? null,
      });
    });

    next();
  }
}
