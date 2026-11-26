export type Role = 'operator' | 'viewer';
export type TenantId = 'A' | 'B';
export type VenueId = 'A1' | 'A2' | 'B1';
export type SessionId = 'operator-A' | 'viewer-A' | 'operator-B';
export type JobStatus = 'FAILED' | 'QUEUED' | 'HEALTHY';

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_SCHEDULE_MS = [1000, 2000, 4000] as const;

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
  readonly isSimulated: boolean;
  retryOutcome?: 'HEALTHY' | 'FAILED';
}

export interface JobPublicDto {
  readonly id: string;
  readonly venueId: VenueId;
  readonly provider: string;
  readonly status: JobStatus;
  readonly lastSuccessAt: string | null;
  readonly lastError: string | null;
  readonly pollCount?: number;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly nextRetryDelayMs: number | null;
  readonly isSimulated: boolean;
}

export interface StubConfig {
  delayMs: number;
  delayVenueId: VenueId | null;
  force500: boolean;
  force500Remaining: number;
  neverComplete: boolean;
  forceRetryFail: boolean;
}

export interface SimulationStats {
  readonly total: number;
  readonly healthy: number;
  readonly failed: number;
  readonly queued: number;
}

export interface SimulateTickResponse {
  readonly generatedCount: number;
  readonly generated: JobPublicDto[];
  readonly items: JobPublicDto[];
  readonly stats: SimulationStats;
}

export function isVenueId(value: unknown): value is VenueId {
  return value === 'A1' || value === 'A2' || value === 'B1';
}

export function isSessionId(value: unknown): value is SessionId {
  return value === 'operator-A' || value === 'viewer-A' || value === 'operator-B';
}

export function getNextRetryDelayMs(retryCount: number, status: JobStatus): number | null {
  if (status !== 'FAILED' || retryCount >= MAX_RETRY_ATTEMPTS) {
    return null;
  }
  return (
    RETRY_BACKOFF_SCHEDULE_MS[retryCount] ?? 4000
  );
}

export function toPublicJobDto(job: JobRecord, includePollCount = false): JobPublicDto {
  const base: JobPublicDto = {
    id: job.id,
    venueId: job.venueId,
    provider: job.provider,
    status: job.status,
    lastSuccessAt: job.lastSuccessAt,
    lastError: job.lastError,
    retryCount: job.retryCount,
    maxRetries: MAX_RETRY_ATTEMPTS,
    nextRetryDelayMs: getNextRetryDelayMs(job.retryCount, job.status),
    isSimulated: job.isSimulated,
  };
  if (includePollCount) {
    return { ...base, pollCount: job.pollCount };
  }
  return base;
}

export function resolvePermittedVenueFilter(
  session: SessionRecord,
  rawVenueId?: string,
): { ok: true; venueFilter?: VenueId } | { ok: false } {
  if (rawVenueId === undefined || rawVenueId.trim() === '' || rawVenueId === 'ALL') {
    return { ok: true, venueFilter: undefined };
  }
  const candidate = rawVenueId.trim();
  if (!isVenueId(candidate) || !session.venueIds.includes(candidate)) {
    return { ok: false };
  }
  return { ok: true, venueFilter: candidate };
}
