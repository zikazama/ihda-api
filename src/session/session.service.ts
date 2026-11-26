import { Injectable } from '@nestjs/common';
import { isSessionId, type SessionId, type SessionRecord } from '../common/types';

const SYNTHETIC_SESSIONS: Record<SessionId, SessionRecord> = {
  'operator-A': {
    sessionId: 'operator-A',
    tenantId: 'A',
    venueIds: ['A1', 'A2'],
    role: 'operator',
  },
  'viewer-A': {
    sessionId: 'viewer-A',
    tenantId: 'A',
    venueIds: ['A1', 'A2'],
    role: 'viewer',
  },
  'operator-B': {
    sessionId: 'operator-B',
    tenantId: 'B',
    venueIds: ['B1'],
    role: 'operator',
  },
};

export const SESSION_COOKIE_NAME = 'ihda_session';

@Injectable()
export class SessionService {
  resolveSession(rawToken: unknown): SessionRecord | null {
    if (!isSessionId(rawToken)) {
      return null;
    }
    return SYNTHETIC_SESSIONS[rawToken];
  }
}
