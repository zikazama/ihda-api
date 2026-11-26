import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  MAX_RETRY_ATTEMPTS,
  resolvePermittedVenueFilter,
  toPublicJobDto,
  type JobPublicDto,
  type PaginationMeta,
  type SessionRecord,
} from '../common/types';
import { StubService } from '../stub/stub.service';
import { JOBS_REPOSITORY, type JobsRepository } from './jobs.repository';

function parseOptionalPositiveInt(
  raw: string | undefined,
  field: 'page' | 'limit',
  max: number,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new BadRequestException({
      error: field === 'page' ? 'INVALID_PAGE' : 'INVALID_LIMIT',
      message: `${field} must be an integer between 1 and ${max}.`,
    });
  }
  const value = Number.parseInt(trimmed, 10);
  if (value < 1 || value > max) {
    throw new BadRequestException({
      error: field === 'page' ? 'INVALID_PAGE' : 'INVALID_LIMIT',
      message: `${field} must be an integer between 1 and ${max}.`,
    });
  }
  return value;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOBS_REPOSITORY) private readonly jobsRepository: JobsRepository,
    private readonly stubService: StubService,
  ) {}

  async listJobs(
    session: SessionRecord,
    rawVenueId?: string,
    rawPage?: string,
    rawLimit?: string,
  ): Promise<{ items: JobPublicDto[]; pagination: PaginationMeta }> {
    const resolved = resolvePermittedVenueFilter(session, rawVenueId);
    if (!resolved.ok) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have access to the requested venue.',
      });
    }

    const hasExplicitPagination =
      (rawPage !== undefined && rawPage.trim() !== '') ||
      (rawLimit !== undefined && rawLimit.trim() !== '');
    const page = parseOptionalPositiveInt(rawPage, 'page', 1000, 1);
    const limit = parseOptionalPositiveInt(rawLimit, 'limit', 100, DEFAULT_PAGE_SIZE);

    await this.stubService.applyFaultsAndDelay(resolved.venueFilter);

    const jobs = this.jobsRepository.listByTenantAndVenues(
      session.tenantId,
      session.venueIds,
      resolved.venueFilter,
    );
    const allDtos = jobs.map((job) => toPublicJobDto(job));
    const total = allDtos.length;

    if (!hasExplicitPagination) {
      return {
        items: allDtos,
        pagination: {
          page: 1,
          limit: Math.max(total, DEFAULT_PAGE_SIZE),
          total,
          totalPages: Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE)),
        },
      };
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    return {
      items: allDtos.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
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
