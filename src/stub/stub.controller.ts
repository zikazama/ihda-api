import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { StubConfig } from '../common/types';
import { JOBS_REPOSITORY, type JobsRepository } from '../jobs/jobs.repository';
import {
  ErrorResponseDto,
  ResetStubResponseDto,
  StubConfigDto,
  UpdateStubConfigRequestDto,
} from '../swagger/swagger.dto';
import { StubService } from './stub.service';

@ApiTags('Stub Controls')
@ApiExtraModels(StubConfigDto, UpdateStubConfigRequestDto, ResetStubResponseDto, ErrorResponseDto)
@Controller('api/stub')
export class StubController {
  constructor(
    private readonly stubService: StubService,
    @Inject(JOBS_REPOSITORY) private readonly jobsRepository: JobsRepository,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Read active stub fault and delay settings',
    description: 'Returns the current deterministic delay, forced 500, and neverComplete configuration.',
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
    description: 'Restores j1, j2, and j3 to initial fixture states and resets all stub fault/delay flags.',
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
}
