import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SessionRecord } from '../common/types';
import {
  ErrorResponseDto,
  SelectSessionRequestDto,
  SessionResponseDto,
  SignedOutResponseDto,
} from '../swagger/swagger.dto';
import { CurrentSession } from './session.decorator';
import { SessionGuard } from './session.guard';
import { SESSION_COOKIE_NAME, SessionService } from './session.service';

@ApiTags('Session')
@ApiExtraModels(SessionResponseDto, SelectSessionRequestDto, SignedOutResponseDto, ErrorResponseDto)
@Controller('api/session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiBearerAuth('bearer-session')
  @ApiCookieAuth('cookie-session')
  @ApiOperation({
    summary: 'Inspect current synthetic session',
    description: 'Resolves tenantId, permitted venueIds, and role from Bearer token or ihda_session cookie.',
  })
  @ApiOkResponse({
    description: 'Authenticated synthetic session metadata.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(SessionResponseDto) },
        examples: {
          operatorA: {
            summary: 'operator-A (Tenant A Operator)',
            value: {
              sessionId: 'operator-A',
              tenantId: 'A',
              venueIds: ['A1', 'A2'],
              role: 'operator',
            },
          },
          viewerA: {
            summary: 'viewer-A (Tenant A Viewer)',
            value: {
              sessionId: 'viewer-A',
              tenantId: 'A',
              venueIds: ['A1', 'A2'],
              role: 'viewer',
            },
          },
          operatorB: {
            summary: 'operator-B (Tenant B Operator)',
            value: {
              sessionId: 'operator-B',
              tenantId: 'B',
              venueIds: ['B1'],
              role: 'operator',
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
  getSession(@CurrentSession() session: SessionRecord): SessionRecord {
    return session;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Select synthetic session or sign out',
    description: 'Sets or clears the HttpOnly ihda_session cookie for local dashboard testing.',
  })
  @ApiBody({
    type: SelectSessionRequestDto,
    examples: {
      operatorA: {
        summary: 'Sign in as operator-A',
        value: { sessionId: 'operator-A' },
      },
      viewerA: {
        summary: 'Sign in as viewer-A',
        value: { sessionId: 'viewer-A' },
      },
      operatorB: {
        summary: 'Sign in as operator-B',
        value: { sessionId: 'operator-B' },
      },
      signOut: {
        summary: 'Clear cookie (401 test)',
        value: { sessionId: null },
      },
    },
  })
  @ApiOkResponse({
    description: 'Session activated or cookie cleared.',
    content: {
      'application/json': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(SessionResponseDto) },
            { $ref: getSchemaPath(SignedOutResponseDto) },
          ],
        },
        examples: {
          operatorASession: {
            summary: 'Signed in as operator-A',
            value: {
              sessionId: 'operator-A',
              tenantId: 'A',
              venueIds: ['A1', 'A2'],
              role: 'operator',
            },
          },
          viewerASession: {
            summary: 'Signed in as viewer-A',
            value: {
              sessionId: 'viewer-A',
              tenantId: 'A',
              venueIds: ['A1', 'A2'],
              role: 'viewer',
            },
          },
          signedOut: {
            summary: 'Signed out',
            value: { signedOut: true },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload or unknown synthetic session ID.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          error: 'UNKNOWN_SYNTHETIC_SESSION',
          message: 'Allowed sessions are operator-A, viewer-A, and operator-B.',
        },
      },
    },
  })
  selectSession(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): SessionRecord | { signedOut: true } {
    if (body === null || typeof body !== 'object' || !('sessionId' in body)) {
      throw new BadRequestException({
        error: 'INVALID_SESSION_PAYLOAD',
        message: 'Request body must include sessionId (or null to sign out).',
      });
    }

    const sessionIdValue = (body as { sessionId: unknown }).sessionId;
    if (sessionIdValue === null) {
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return { signedOut: true };
    }

    const session = this.sessionService.resolveSession(sessionIdValue);
    if (!session) {
      throw new BadRequestException({
        error: 'UNKNOWN_SYNTHETIC_SESSION',
        message: 'Allowed sessions are operator-A, viewer-A, and operator-B.',
      });
    }

    res.cookie(SESSION_COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });

    return session;
  }
}
