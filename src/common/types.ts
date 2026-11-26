export type Role = 'operator' | 'viewer';
export type TenantId = 'A' | 'B';
export type VenueId = 'A1' | 'A2' | 'B1';
export type SessionId = 'operator-A' | 'viewer-A' | 'operator-B';
export type JobStatus = 'FAILED' | 'QUEUED' | 'HEALTHY';

export interface SessionRecord {
  readonly sessionId: SessionId;
  readonly tenantId: TenantId;
  readonly venueIds: readonly VenueId[];
  readonly role: Role;
}

export interface JobRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly venueId: VenueId;
  readonly provider: string;
  status: JobStatus;
  lastSuccessAt: string | null;
  lastError: string | null;
  pollCount: number;
  retryCount: number;
}

export interface JobPublicDto {
  readonly id: string;
  readonly venueId: VenueId;
  readonly provider: string;
  readonly status: JobStatus;
  readonly lastSuccessAt: string | null;
  readonly lastError: string | null;
  readonly pollCount?: number;
}

export interface StubConfig {
  delayMs: number;
  delayVenueId: VenueId | null;
  force500: boolean;
  force500Remaining: number;
  neverComplete: boolean;
}

export function isVenueId(value: unknown): value is VenueId {
  return value === 'A1' || value === 'A2' || value === 'B1';
}

export function isSessionId(value: unknown): value is SessionId {
  return value === 'operator-A' || value === 'viewer-A' || value === 'operator-B';
}
