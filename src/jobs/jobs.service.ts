import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JobPublicDto, JobRecord, SessionRecord, VenueId } from '../common/types';
import { isVenueId } from '../common/types';
import { StubService } from '../stub/stub.service';
import { JOBS_REPOSITORY, type JobsRepository } from './jobs.repository';

function toPublicDto(job: JobRecord, includePollCount = false): JobPublicDto {
  const base: JobPublicDto = {
    id: job.id,
    venueId: job.venueId,
    provider: job.provider,
    status: job.status,
    lastSuccessAt: job.lastSuccessAt,
    lastError: job.lastError,
  };
  if (includePollCount) {
    return { ...base, pollCount: job.pollCount };
  }
  return base;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOBS_REPOSITORY) private readonly jobsRepository: JobsRepository,
    private readonly stubService: StubService,
  ) {}

  async listJobs(session: SessionRecord, rawVenueId?: string): Promise<{ items: JobPublicDto[] }> {
    let venueFilter: VenueId | undefined;

    if (rawVenueId !== undefined && rawVenueId.trim() !== '' && rawVenueId !== 'ALL') {
      const candidate = rawVenueId.trim();
      if (!isVenueId(candidate) || !session.venueIds.includes(candidate)) {
        throw new ForbiddenException({
          error: 'FORBIDDEN',
          message: 'You do not have access to the requested venue.',
        });
      }
      venueFilter = candidate;
    }

    await this.stubService.applyFaultsAndDelay(venueFilter);

    const jobs = this.jobsRepository.listByTenantAndVenues(
      session.tenantId,
      session.venueIds,
      venueFilter,
    );

    return {
      items: jobs.map((job) => toPublicDto(job)),
    };
  }

  async getJobDetail(session: SessionRecord, jobId: string): Promise<JobPublicDto> {
    const job = this.jobsRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException({
        error: 'JOB_NOT_FOUND',
        message: 'Integration job was not found.',
      });
    }

    if (job.tenantId !== session.tenantId || !session.venueIds.includes(job.venueId)) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have access to this job.',
      });
    }

    await this.stubService.applyFaultsAndDelay(job.venueId);

    if (job.status === 'QUEUED') {
      job.pollCount += 1;
      const stubConfig = this.stubService.getConfig();
      if (!stubConfig.neverComplete && job.pollCount >= 2) {
        job.status = 'HEALTHY';
        job.lastSuccessAt = new Date().toISOString();
        job.lastError = null;
        job.pollCount = 0;
      }
    }

    return toPublicDto(job, true);
  }

  retryJob(session: SessionRecord, jobId: string): { jobId: string; status: 'QUEUED' } {
    if (session.role !== 'operator') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Operator role is required to retry jobs.',
      });
    }

    const job = this.jobsRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException({
        error: 'JOB_NOT_FOUND',
        message: 'Integration job was not found.',
      });
    }

    if (job.tenantId !== session.tenantId || !session.venueIds.includes(job.venueId)) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have access to this job.',
      });
    }

    // Synchronous atomic check-and-transition prevents concurrent duplicate retries.
    if (job.status === 'QUEUED') {
      throw new ConflictException({
        error: 'RETRY_ALREADY_ACTIVE',
        message: 'A retry is already active for this job.',
        jobId: job.id,
        status: 'QUEUED',
      });
    }

    if (job.status === 'HEALTHY') {
      throw new ConflictException({
        error: 'JOB_NOT_FAILED',
        message: 'Only FAILED jobs can be retried.',
        jobId: job.id,
        status: 'HEALTHY',
      });
    }

    job.status = 'QUEUED';
    job.pollCount = 0;
    job.retryCount += 1;

    return {
      jobId: job.id,
      status: 'QUEUED',
    };
  }
}
