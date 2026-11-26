import { Injectable } from '@nestjs/common';
import type { JobRecord, TenantId, VenueId } from '../common/types';

export const JOBS_REPOSITORY = Symbol('JOBS_REPOSITORY');

export interface JobsRepository {
  listByTenantAndVenues(tenantId: TenantId, permittedVenues: readonly VenueId[], venueFilter?: VenueId): JobRecord[];
  findById(jobId: string): JobRecord | undefined;
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
    },
  ];
}

@Injectable()
export class InMemoryJobsRepository implements JobsRepository {
  private jobs: JobRecord[] = createInitialFixtures();

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

  reset(): void {
    this.jobs = createInitialFixtures();
  }
}
