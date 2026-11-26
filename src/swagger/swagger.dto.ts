import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { JobStatus, Role, SessionId, TenantId, VenueId } from '../common/types';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'ihda-api' })
  service!: string;

  @ApiProperty({ example: '2026-11-26T13:15:00.000Z' })
  timestamp!: string;
}

export class SessionResponseDto {
  @ApiProperty({ example: 'operator-A', enum: ['operator-A', 'viewer-A', 'operator-B'] })
  sessionId!: SessionId;

  @ApiProperty({ example: 'A', enum: ['A', 'B'] })
  tenantId!: TenantId;

  @ApiProperty({ example: ['A1', 'A2'], isArray: true, enum: ['A1', 'A2', 'B1'] })
  venueIds!: VenueId[];

  @ApiProperty({ example: 'operator', enum: ['operator', 'viewer'] })
  role!: Role;
}

export class SelectSessionRequestDto {
  @ApiProperty({
    nullable: true,
    example: 'operator-A',
    enum: ['operator-A', 'viewer-A', 'operator-B', null],
    description: 'Synthetic session identifier, or null to sign out and clear the cookie.',
  })
  sessionId!: SessionId | null;
}

export class SignedOutResponseDto {
  @ApiProperty({ example: true })
  signedOut!: boolean;
}

export class JobDto {
  @ApiProperty({ example: 'j1' })
  id!: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1'] })
  venueId!: VenueId;

  @ApiProperty({ example: 'Mock POS' })
  provider!: string;

  @ApiProperty({ example: 'FAILED', enum: ['FAILED', 'QUEUED', 'HEALTHY'] })
  status!: JobStatus;

  @ApiProperty({ example: '2026-11-23T09:00:00Z', nullable: true })
  lastSuccessAt!: string | null;

  @ApiProperty({
    example: 'POS sync timed out waiting for settlement batch response.',
    nullable: true,
  })
  lastError!: string | null;

  @ApiPropertyOptional({
    example: 1,
    description: 'Number of GET /api/jobs/:id polls recorded while QUEUED (detail endpoint only).',
  })
  pollCount?: number;

  @ApiProperty({ example: 0, minimum: 0, maximum: 3 })
  retryCount!: number;

  @ApiProperty({ example: 3 })
  maxRetries!: number;

  @ApiProperty({
    example: 1000,
    nullable: true,
    description: 'Escalating retry backoff wait in ms before the next attempt (1000 -> 2000 -> 4000, or null if not FAILED / max reached).',
  })
  nextRetryDelayMs!: number | null;

  @ApiProperty({ example: false })
  isSimulated!: boolean;
}

export class JobListResponseDto {
  @ApiProperty({ type: [JobDto] })
  items!: JobDto[];
}

export class RetryQueuedResponseDto {
  @ApiProperty({ example: 'j1' })
  jobId!: string;

  @ApiProperty({ example: 'QUEUED', enum: ['QUEUED'] })
  status!: 'QUEUED';
}

export class StubConfigDto {
  @ApiProperty({ example: 0, minimum: 0, maximum: 10000 })
  delayMs!: number;

  @ApiProperty({ example: null, nullable: true, enum: ['A1', 'A2', 'B1', null] })
  delayVenueId!: VenueId | null;

  @ApiProperty({ example: false })
  force500!: boolean;

  @ApiProperty({ example: 0, minimum: 0, maximum: 20 })
  force500Remaining!: number;

  @ApiProperty({ example: false })
  neverComplete!: boolean;

  @ApiProperty({ example: false })
  forceRetryFail!: boolean;
}

export class UpdateStubConfigRequestDto {
  @ApiPropertyOptional({ example: 1200, minimum: 0, maximum: 10000 })
  delayMs?: number;

  @ApiPropertyOptional({ example: 'A1', nullable: true, enum: ['A1', 'A2', 'B1', null] })
  delayVenueId?: VenueId | null;

  @ApiPropertyOptional({ example: false })
  force500?: boolean;

  @ApiPropertyOptional({ example: 1, minimum: 0, maximum: 20 })
  force500Remaining?: number;

  @ApiPropertyOptional({ example: false })
  neverComplete?: boolean;

  @ApiPropertyOptional({ example: false })
  forceRetryFail?: boolean;
}

export class ResetStubResponseDto {
  @ApiProperty({ example: 'reset', enum: ['reset'] })
  status!: 'reset';

  @ApiProperty({ type: StubConfigDto })
  config!: StubConfigDto;
}

export class SimulateTickRequestDto {
  @ApiPropertyOptional({
    example: 'ALL',
    enum: ['ALL', 'A1', 'A2', 'B1'],
    description: 'Optional venue filter within authenticated tenant scope.',
  })
  venueId?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 3 })
  minCount?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 3 })
  maxCount?: number;
}

export class SimulationStatsDto {
  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 3 })
  healthy!: number;

  @ApiProperty({ example: 2 })
  failed!: number;

  @ApiProperty({ example: 0 })
  queued!: number;
}

export class SimulateTickResponseDto {
  @ApiProperty({ example: 2, minimum: 1, maximum: 3 })
  generatedCount!: number;

  @ApiProperty({ type: [JobDto] })
  generated!: JobDto[];

  @ApiProperty({ type: [JobDto] })
  items!: JobDto[];

  @ApiProperty({ type: SimulationStatsDto })
  stats!: SimulationStatsDto;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 'FORBIDDEN' })
  error!: string;

  @ApiProperty({ example: 'Operator role is required to perform this action.' })
  message!: string;

  @ApiPropertyOptional({ example: 'j1' })
  jobId?: string;

  @ApiPropertyOptional({ example: 'QUEUED' })
  status?: string;

  @ApiPropertyOptional({ example: 3 })
  retryCount?: number;

  @ApiPropertyOptional({ example: 3 })
  maxRetries?: number;
}
