import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, getSchemaPath, ApiExtraModels } from '@nestjs/swagger';
import { HealthResponseDto } from '../swagger/swagger.dto';

@ApiTags('Health')
@ApiExtraModels(HealthResponseDto)
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Service health check',
    description: 'Returns HTTP 200 when the ihda-api process is healthy and accepting requests.',
  })
  @ApiOkResponse({
    description: 'Service is healthy.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(HealthResponseDto) },
        example: {
          status: 'ok',
          service: 'ihda-api',
          timestamp: '2026-11-26T13:15:00.000Z',
        },
      },
    },
  })
  getHealth(): { status: 'ok'; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'ihda-api',
      timestamp: new Date().toISOString(),
    };
  }
}
