import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_RETRY_ATTEMPTS,
  resolvePermittedVenueFilter,
  toPublicJobDto,
  type JobPublicDto,
  type SessionRecord,
} from '../common/types';
import { StubService } from '../stub/stub.service';
import { JOBS_REPOSITORY, type JobsRepository } from './jobs.repository';

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOBS_REPOSITORY) private readonly jobsRepository: JobsRepository,
    private readonly stubService: StubService,
  ) {}

  async listJobs(session: SessionRecord, rawVenueId?: string): Promise<{ items: JobPublicDto[] }> {
    const resolved = resolvePermittedVenueFilter(session, rawVenueId);
    if (!resolved.ok) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have access to the requested venue.',
      });
    }

    await this.stubService.applyFaultsAndDelay(resolved.venueFilter);

    const jobs = this.jobsRepository.listByTenantAndVenues(
      session.tenantId,
      session.venueIds,
      resolved.venueFilter,
    );

    return {
      items: jobs.map((job) => toPublicJobDto(job)),
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
        const shouldFail = stubConfig.forceRetryFail || job.retryOutcome === 'FAILED';
        if (shouldFail) {
          job.status = 'FAILED';
          job.pollCount = 0;
          job.retryOutcome = undefined;
          job.lastError =
            job.retryCount >= MAX_RETRY_ATTEMPTS
              ? `Retry ${job.retryCount}/${MAX_RETRY_ATTEMPTS} failed (max 3/3 retries reached).`
              : `Retry ${job.retryCount}/${MAX_RETRY_ATTEMPTS} failed — backoff interval escalated.`;
        } else {
          job.status = 'HEALTHY';
          job.lastSuccessAt = new Date().toISOString();
          job.lastError = null;
          job.pollCount = 0;
          job.retryOutcome = undefined;
        }
      }
    }

    return toPublicJobDto(job, true);
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

    if (job.retryCount >= MAX_RETRY_ATTEMPTS) {
      throw new ConflictException({
        error: 'MAX_RETRIES_EXCEEDED',
        message: `Maximum retry limit (${MAX_RETRY_ATTEMPTS}/${MAX_RETRY_ATTEMPTS}) reached for this job.`,
        jobId: job.id,
        status: job.status,
        retryCount: job.retryCount,
        maxRetries: MAX_RETRY_ATTEMPTS,
      });
    }

    const stubConfig = this.stubService.getConfig();
    job.retryCount += 1;
    job.status = 'QUEUED';
    job.pollCount = 0;

    if (stubConfig.forceRetryFail) {
      job.retryOutcome = 'FAILED';
    } else if (job.isSimulated) {
      job.retryOutcome = Math.random() < 0.55 ? 'HEALTHY' : 'FAILED';
    } else {
      job.retryOutcome = 'HEALTHY';
    }

    return {
      jobId: job.id,
      status: 'QUEUED',
    };
  }
}
