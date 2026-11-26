import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JobPublicDto, SessionRecord } from '../common/types';
import { RolesGuard } from '../session/roles.guard';
import { CurrentSession, Roles } from '../session/session.decorator';
import { SessionGuard } from '../session/session.guard';
import {
  ErrorResponseDto,
  JobDto,
  JobListResponseDto,
  RetryQueuedResponseDto,
} from '../swagger/swagger.dto';
import { JobsService } from './jobs.service';

@ApiTags('Jobs')
@ApiBearerAuth('bearer-session')
@ApiCookieAuth('cookie-session')
@ApiExtraModels(JobDto, JobListResponseDto, RetryQueuedResponseDto, ErrorResponseDto)
@Controller('api/jobs')
@UseGuards(SessionGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({
    summary: 'List integration jobs for active tenant',
    description: 'Returns integration jobs scoped to the authenticated tenant and permitted venues.',
  })
  @ApiQuery({
    name: 'venueId',
    required: false,
    enum: ['ALL', 'A1', 'A2', 'B1'],
    example: 'A1',
    description: 'Optional venue filter. Unpermitted venues return 403 before delay or fault injection.',
  })
  @ApiOkResponse({
    description: 'Tenant-scoped list of integration jobs.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(JobListResponseDto) },
        examples: {
          tenantAAll: {
            summary: 'operator-A / viewer-A (All permitted venues)',
            value: {
              items: [
                {
                  id: 'j1',
                  venueId: 'A1',
                  provider: 'Mock POS',
                  status: 'FAILED',
                  lastSuccessAt: '2026-11-23T09:00:00Z',
                  lastError: 'POS sync timed out waiting for settlement batch response.',
                },
                {
                  id: 'j2',
                  venueId: 'A2',
                  provider: 'Mock HR',
                  status: 'HEALTHY',
                  lastSuccessAt: '2026-11-24T01:00:00Z',
                  lastError: null,
                },
              ],
            },
          },
          venueA1Only: {
            summary: 'operator-A filtered by venueId=A1',
            value: {
              items: [
                {
                  id: 'j1',
                  venueId: 'A1',
                  provider: 'Mock POS',
                  status: 'FAILED',
                  lastSuccessAt: '2026-11-23T09:00:00Z',
                  lastError: 'POS sync timed out waiting for settlement batch response.',
                },
              ],
            },
          },
          tenantBOnly: {
            summary: 'operator-B (Tenant B, venue B1)',
            value: {
              items: [
                {
                  id: 'j3',
                  venueId: 'B1',
                  provider: 'Mock Reservations',
                  status: 'FAILED',
                  lastSuccessAt: null,
                  lastError: 'Reservation provider rejected sync token (sandbox auth error).',
                },
              ],
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid synthetic session.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'UNAUTHORIZED',
          message: 'Valid synthetic session required.',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Requested venue is outside the caller tenant scope (for example venueId=B1 as operator-A).',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'FORBIDDEN',
          message: 'You do not have access to the requested venue.',
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Simulated server failure when forced500 or force500Remaining is active.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'FORCED_STUB_500',
          message: 'Simulated transient server failure. Retry the request to recover.',
        },
      },
    },
  })
  listJobs(
    @CurrentSession() session: SessionRecord,
    @Query('venueId') venueId?: string,
  ): Promise<{ items: JobPublicDto[] }> {
    return this.jobsService.listJobs(session, venueId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single job detail (advances queued retry polling)',
    description: 'Returns one job within tenant scope. When QUEUED and neverComplete is false, transitions to HEALTHY on poll 2.',
  })
  @ApiParam({
    name: 'id',
    example: 'j1',
    description: 'Job identifier (j1, j2 for tenant A; j3 for tenant B).',
  })
  @ApiOkResponse({
    description: 'Job detail payload with pollCount.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(JobDto) },
        examples: {
          failedJob: {
            summary: 'Initial FAILED state (j1)',
            value: {
              id: 'j1',
              venueId: 'A1',
              provider: 'Mock POS',
              status: 'FAILED',
              lastSuccessAt: '2026-11-23T09:00:00Z',
              lastError: 'POS sync timed out waiting for settlement batch response.',
              pollCount: 0,
            },
          },
          queuedAfterPoll1: {
            summary: 'QUEUED after poll 1',
            value: {
              id: 'j1',
              venueId: 'A1',
              provider: 'Mock POS',
              status: 'QUEUED',
              lastSuccessAt: '2026-11-23T09:00:00Z',
              lastError: 'POS sync timed out waiting for settlement batch response.',
              pollCount: 1,
            },
          },
          healthyAfterPoll2: {
            summary: 'HEALTHY after poll 2',
            value: {
              id: 'j1',
              venueId: 'A1',
              provider: 'Mock POS',
              status: 'HEALTHY',
              lastSuccessAt: '2026-11-26T13:16:00.000Z',
              lastError: null,
              pollCount: 0,
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid synthetic session.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'UNAUTHORIZED',
          message: 'Valid synthetic session required.',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Job belongs to another tenant or unpermitted venue (for example j3 as operator-A).',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'FORBIDDEN',
          message: 'You do not have access to this job.',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Job ID does not exist.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'JOB_NOT_FOUND',
          message: 'Integration job was not found.',
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Simulated server failure when forced500 or force500Remaining is active.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'FORCED_STUB_500',
          message: 'Simulated upstream server failure (forced500 mode).',
        },
      },
    },
  })
  getJobDetail(
    @CurrentSession() session: SessionRecord,
    @Param('id') jobId: string,
  ): Promise<JobPublicDto> {
    return this.jobsService.getJobDetail(session, jobId);
  }

  @Post(':id/retry')
  @UseGuards(RolesGuard)
  @Roles('operator')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue a retry for a FAILED integration job',
    description: 'Operator-only action. Enforces tenant scope and rejects concurrent or duplicate retries with 409.',
  })
  @ApiParam({
    name: 'id',
    example: 'j1',
    description: 'Failed job ID belonging to the active tenant.',
  })
  @ApiAcceptedResponse({
    description: 'Retry queued successfully.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(RetryQueuedResponseDto) },
        example: {
          jobId: 'j1',
          status: 'QUEUED',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid synthetic session.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'UNAUTHORIZED',
          message: 'Valid synthetic session required.',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Viewer role or cross-tenant job access rejected.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          viewerForbidden: {
            summary: 'viewer-A attempting retry',
            value: {
              error: 'FORBIDDEN',
              message: 'Operator role is required to perform this action.',
            },
          },
          crossTenantForbidden: {
            summary: 'operator-A attempting retry on tenant B job j3',
            value: {
              error: 'FORBIDDEN',
              message: 'You do not have access to this job.',
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Job ID does not exist.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'JOB_NOT_FOUND',
          message: 'Integration job was not found.',
        },
      },
    },
  })
  @ApiConflictResponse({
    description: 'Duplicate retry while QUEUED or retry attempted on an already HEALTHY job.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          retryAlreadyActive: {
            summary: 'Concurrent or duplicate retry while QUEUED',
            value: {
              error: 'RETRY_ALREADY_ACTIVE',
              message: 'A retry is already active for this job.',
              jobId: 'j1',
              status: 'QUEUED',
            },
          },
          jobAlreadyHealthy: {
            summary: 'Job already HEALTHY',
            value: {
              error: 'JOB_NOT_FAILED',
              message: 'Only FAILED jobs can be retried.',
              jobId: 'j2',
              status: 'HEALTHY',
            },
          },
        },
      },
    },
  })
  retryJob(
    @CurrentSession() session: SessionRecord,
    @Param('id') jobId: string,
  ): { jobId: string; status: 'QUEUED' } {
    return this.jobsService.retryJob(session, jobId);
  }
}
