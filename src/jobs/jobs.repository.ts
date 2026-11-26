import { Injectable } from '@nestjs/common';
import type { JobRecord, TenantId, VenueId } from '../common/types';

export const JOBS_REPOSITORY = Symbol('JOBS_REPOSITORY');

const MAX_SIMULATED_JOBS = 200;

const SIMULATED_PROVIDERS = [
  'Toast POS',
  'Square POS',
  'Lightspeed POS',
  'Deputy HR',
  'Xero Ledger',
  'SevenRooms',
  'OpenTable Sync',
  'Stripe Settlement',
  'Kounta Inventory',
] as const;

const SIMULATED_ERRORS = [
  'Webhook delivery timed out after 5000ms waiting for ACK.',
  'Upstream provider rate limit exceeded (HTTP 429 Too Many Requests).',
  'Transient upstream gateway 503 during incremental sync.',
  'OAuth sandbox token refresh returned expired session claim.',
  'Settlement batch checksum mismatch on delta reconciliation.',
] as const;

export interface JobsRepository {
  listByTenantAndVenues(
    tenantId: TenantId,
    permittedVenues: readonly VenueId[],
    venueFilter?: VenueId,
  ): JobRecord[];
  findById(jobId: string): JobRecord | undefined;
  generateSimulatedBatch(
    tenantId: TenantId,
    permittedVenues: readonly VenueId[],
    venueFilter?: VenueId,
    minCount?: number,
    maxCount?: number,
  ): JobRecord[];
  reset(): void;
}

function createInitialFixtures(): JobRecord[] {
  return [
    {
      id: 'j1',
      tenantId: 'A',
      venueId: 'A1',
      provider: 'Mock POS',
      status: 'FAILED',
      lastSuccessAt: '2026-11-23T09:00:00Z',
      lastError: 'POS sync timed out waiting for settlement batch response.',
      pollCount: 0,
      retryCount: 0,
      isSimulated: false,
    },
    {
      id: 'j2',
      tenantId: 'A',
      venueId: 'A2',
      provider: 'Mock HR',
      status: 'HEALTHY',
      lastSuccessAt: '2026-11-24T01:00:00Z',
      lastError: null,
      pollCount: 0,
      retryCount: 0,
      isSimulated: false,
    },
    {
      id: 'j3',
      tenantId: 'B',
      venueId: 'B1',
      provider: 'Mock Reservations',
      status: 'FAILED',
      lastSuccessAt: null,
      lastError: 'Reservation provider rejected sync token (sandbox auth error).',
      pollCount: 0,
      retryCount: 0,
      isSimulated: false,
    },
  ];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? items[0]!;
}

@Injectable()
export class InMemoryJobsRepository implements JobsRepository {
  private jobs: JobRecord[] = createInitialFixtures();
  private simSequence = 0;

  listByTenantAndVenues(
    tenantId: TenantId,
    permittedVenues: readonly VenueId[],
    venueFilter?: VenueId,
  ): JobRecord[] {
    return this.jobs.filter((job) => {
      if (job.tenantId !== tenantId) {
        return false;
      }
      if (!permittedVenues.includes(job.venueId)) {
        return false;
      }
      if (venueFilter && job.venueId !== venueFilter) {
        return false;
      }
      return true;
    });
  }

  findById(jobId: string): JobRecord | undefined {
    return this.jobs.find((job) => job.id === jobId);
  }

  generateSimulatedBatch(
    tenantId: TenantId,
    permittedVenues: readonly VenueId[],
    venueFilter?: VenueId,
    minCount = 1,
    maxCount = 3,
  ): JobRecord[] {
    const venuePool = venueFilter ? [venueFilter] : permittedVenues;
    const batchCount = randomInt(minCount, maxCount);
    const created: JobRecord[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < batchCount; i += 1) {
      this.simSequence += 1;
      const venueId = pickRandom(venuePool);
      const provider = pickRandom(SIMULATED_PROVIDERS);
      const isHealthy = Math.random() < 0.6;
      const status = isHealthy ? 'HEALTHY' : 'FAILED';
      const lastSuccessAt = isHealthy
        ? nowIso
        : Math.random() < 0.7
          ? new Date(Date.now() - randomInt(5, 180) * 60_000).toISOString()
          : null;

      created.push({
        id: `sim-${this.simSequence}`,
        tenantId,
        venueId,
        provider,
        status,
        lastSuccessAt,
        lastError: isHealthy ? null : pickRandom(SIMULATED_ERRORS),
        pollCount: 0,
        retryCount: 0,
        isSimulated: true,
      });
    }

    // Prepend newest simulated jobs while keeping baseline fixtures in place.
    const nextJobs = [...created, ...this.jobs];
    let simCount = nextJobs.filter((job) => job.isSimulated).length;

    while (simCount > MAX_SIMULATED_JOBS) {
      let removeIndex = -1;
      for (let i = nextJobs.length - 1; i >= 0; i -= 1) {
        const candidate = nextJobs[i];
        if (candidate && candidate.isSimulated && candidate.status !== 'QUEUED') {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex === -1) {
        for (let i = nextJobs.length - 1; i >= 0; i -= 1) {
          if (nextJobs[i]?.isSimulated) {
            removeIndex = i;
            break;
          }
        }
      }
      if (removeIndex === -1) {
        break;
      }
      nextJobs.splice(removeIndex, 1);
      simCount -= 1;
    }

    this.jobs = nextJobs;
    return created;
  }

  reset(): void {
    this.jobs = createInitialFixtures();
    this.simSequence = 0;
  }
}
