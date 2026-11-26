import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  resolvePermittedVenueFilter,
  toPublicJobDto,
  type SessionRecord,
  type SimulateTickResponse,
  type StubConfig,
} from '../common/types';
import { JOBS_REPOSITORY, type JobsRepository } from '../jobs/jobs.repository';
import { CurrentSession } from '../session/session.decorator';
import { SessionGuard } from '../session/session.guard';
import {
  ErrorResponseDto,
  JobDto,
  ResetStubResponseDto,
  SimulateTickRequestDto,
  SimulateTickResponseDto,
  SimulationStatsDto,
  StubConfigDto,
  UpdateStubConfigRequestDto,
} from '../swagger/swagger.dto';
import { StubService } from './stub.service';

@ApiTags('Stub Controls')
@ApiExtraModels(
  JobDto,
  StubConfigDto,
  UpdateStubConfigRequestDto,
  ResetStubResponseDto,
  SimulateTickRequestDto,
  SimulateTickResponseDto,
  SimulationStatsDto,
  ErrorResponseDto,
)
@Controller('api/stub')
export class StubController {
  constructor(
    private readonly stubService: StubService,
    @Inject(JOBS_REPOSITORY) private readonly jobsRepository: JobsRepository,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Read active stub fault and delay settings',
    description: 'Returns the current deterministic delay, forced 500, neverComplete, and forceRetryFail configuration.',
  })
  @ApiOkResponse({
    description: 'Current stub configuration.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(StubConfigDto) },
        example: {
          delayMs: 0,
          delayVenueId: null,
          force500: false,
          force500Remaining: 0,
          neverComplete: false,
          forceRetryFail: false,
        },
      },
    },
  })
  getConfig(): StubConfig {
    return this.stubService.getConfig();
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Configure deterministic delay or fault modes',
    description: 'Applies partial updates to stub timing and error injection for automated and manual testing.',
  })
  @ApiBody({
    type: UpdateStubConfigRequestDto,
    examples: {
      normal: {
        summary: 'Reset to normal behavior',
        value: {
          delayMs: 0,
          delayVenueId: null,
          force500: false,
          force500Remaining: 0,
          neverComplete: false,
          forceRetryFail: false,
        },
      },
      delayA1: {
        summary: 'Delay A1 requests by 1200ms (race test)',
        value: {
          delayMs: 1200,
          delayVenueId: 'A1',
        },
      },
      forced500Once: {
        summary: 'Fail the next read with 500, then recover',
        value: {
          force500Remaining: 1,
          force500: false,
        },
      },
      neverComplete: {
        summary: 'Keep retried jobs in QUEUED forever',
        value: {
          neverComplete: true,
        },
      },
      forceRetryFail: {
        summary: 'Force every retry attempt to fail (3/3 limit verification)',
        value: {
          forceRetryFail: true,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Updated stub configuration.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(StubConfigDto) },
        examples: {
          delayA1Response: {
            summary: 'Delay A1 enabled',
            value: {
              delayMs: 1200,
              delayVenueId: 'A1',
              force500: false,
              force500Remaining: 0,
              neverComplete: false,
              forceRetryFail: false,
            },
          },
          forced500OnceResponse: {
            summary: 'One transient 500 armed',
            value: {
              delayMs: 0,
              delayVenueId: null,
              force500: false,
              force500Remaining: 1,
              neverComplete: false,
              forceRetryFail: false,
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed on stub config field.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'INVALID_DELAY',
          message: 'delayMs must be a number between 0 and 10000.',
        },
      },
    },
  })
  updateConfig(@Body() body: unknown): StubConfig {
    return this.stubService.updateConfig(body);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset fixtures and stub mode',
    description: 'Restores j1, j2, and j3 to initial fixture states, removes simulated jobs, and resets all stub flags.',
  })
  @ApiOkResponse({
    description: 'Fixtures and stub configuration reset.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ResetStubResponseDto) },
        example: {
          status: 'reset',
          config: {
            delayMs: 0,
            delayVenueId: null,
            force500: false,
            force500Remaining: 0,
            neverComplete: false,
            forceRetryFail: false,
          },
        },
      },
    },
  })
  resetFixtures(): { status: 'reset'; config: StubConfig } {
    this.jobsRepository.reset();
    const config = this.stubService.resetConfig();
    return { status: 'reset', config };
  }

  @Post('simulate-tick')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer-session')
  @ApiCookieAuth('cookie-session')
  @ApiOperation({
    summary: 'Generate 1-3 random jobs on demand while dashboard is open',
    description:
      'Creates 1-3 random HEALTHY/FAILED simulated integration jobs within the caller tenant scope. Triggered only by an open visible frontend tab.',
  })
  @ApiBody({
    type: SimulateTickRequestDto,
    required: false,
    examples: {
      allPermitted: {
        summary: 'Generate 1-3 jobs across permitted venues',
        value: {
          venueId: 'ALL',
          minCount: 1,
          maxCount: 3,
        },
      },
      scopedVenueA1: {
        summary: 'Generate 1-3 jobs scoped to venue A1',
        value: {
          venueId: 'A1',
          minCount: 1,
          maxCount: 3,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Simulated batch generated and current scoped job list returned.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(SimulateTickResponseDto) },
        example: {
          generatedCount: 2,
          generated: [
            {
              id: 'sim-1',
              venueId: 'A1',
              provider: 'Toast POS',
              status: 'FAILED',
              lastSuccessAt: '2026-11-26T14:00:00.000Z',
              lastError: 'Webhook delivery timed out after 5000ms waiting for ACK.',
              retryCount: 0,
              maxRetries: 3,
              nextRetryDelayMs: 1000,
              isSimulated: true,
            },
            {
              id: 'sim-2',
              venueId: 'A2',
              provider: 'Deputy HR',
              status: 'HEALTHY',
              lastSuccessAt: '2026-11-26T14:25:00.000Z',
              lastError: null,
              retryCount: 0,
              maxRetries: 3,
              nextRetryDelayMs: null,
              isSimulated: true,
            },
          ],
          items: [],
          stats: {
            total: 4,
            healthy: 2,
            failed: 2,
            queued: 0,
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
    description: 'Requested venueId is outside the caller tenant scope.',
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
  simulateTick(@CurrentSession() session: SessionRecord, @Body() body?: unknown): SimulateTickResponse {
    let rawVenueId: string | undefined;
    let minCount = 1;
    let maxCount = 3;

    if (body !== undefined && body !== null) {
      if (typeof body !== 'object' || Array.isArray(body)) {
        throw new BadRequestException({
          error: 'INVALID_SIMULATION_PAYLOAD',
          message: 'Simulation payload must be a JSON object.',
        });
      }
      const raw = body as Record<string, unknown>;
      if ('venueId' in raw && raw.venueId !== undefined && raw.venueId !== null) {
        if (typeof raw.venueId !== 'string') {
          throw new BadRequestException({
            error: 'INVALID_VENUE_FILTER',
            message: 'venueId must be a string when provided.',
          });
        }
        rawVenueId = raw.venueId;
      }
      if ('minCount' in raw && raw.minCount !== undefined) {
        if (typeof raw.minCount !== 'number' || !Number.isInteger(raw.minCount) || raw.minCount < 1 || raw.minCount > 3) {
          throw new BadRequestException({
            error: 'INVALID_MIN_COUNT',
            message: 'minCount must be an integer between 1 and 3.',
          });
        }
        minCount = raw.minCount;
      }
      if ('maxCount' in raw && raw.maxCount !== undefined) {
        if (typeof raw.maxCount !== 'number' || !Number.isInteger(raw.maxCount) || raw.maxCount < 1 || raw.maxCount > 3) {
          throw new BadRequestException({
            error: 'INVALID_MAX_COUNT',
            message: 'maxCount must be an integer between 1 and 3.',
          });
        }
        maxCount = raw.maxCount;
      }
      if (minCount > maxCount) {
        throw new BadRequestException({
          error: 'INVALID_COUNT_RANGE',
          message: 'minCount cannot exceed maxCount.',
        });
      }
    }

    const resolved = resolvePermittedVenueFilter(session, rawVenueId);
    if (!resolved.ok) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have access to the requested venue.',
      });
    }

    const created = this.jobsRepository
      .generateSimulatedBatch(session.tenantId, session.venueIds, resolved.venueFilter, minCount, maxCount)
      .map((job) => toPublicJobDto(job));

    const items = this.jobsRepository
      .listByTenantAndVenues(session.tenantId, session.venueIds, resolved.venueFilter)
      .map((job) => toPublicJobDto(job));

    const healthy = items.filter((job) => job.status === 'HEALTHY').length;
    const failed = items.filter((job) => job.status === 'FAILED').length;
    const queued = items.filter((job) => job.status === 'QUEUED').length;

    return {
      generatedCount: created.length,
      generated: created,
      items,
      stats: {
        total: items.length,
        healthy,
        failed,
        queued,
      },
    };
  }
}
