import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { isVenueId, type StubConfig, type VenueId } from '../common/types';

const DEFAULT_STUB_CONFIG: StubConfig = {
  delayMs: 0,
  delayVenueId: null,
  force500: false,
  force500Remaining: 0,
  neverComplete: false,
  forceRetryFail: false,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class StubService {
  private config: StubConfig = { ...DEFAULT_STUB_CONFIG };

  getConfig(): StubConfig {
    return { ...this.config };
  }

  updateConfig(input: unknown): StubConfig {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException({
        error: 'INVALID_STUB_CONFIG',
        message: 'Stub config payload must be a JSON object.',
      });
    }

    const raw = input as Record<string, unknown>;
    const next: StubConfig = { ...this.config };

    if ('delayMs' in raw) {
      if (typeof raw.delayMs !== 'number' || !Number.isFinite(raw.delayMs) || raw.delayMs < 0 || raw.delayMs > 10000) {
        throw new BadRequestException({
          error: 'INVALID_DELAY',
          message: 'delayMs must be a number between 0 and 10000.',
        });
      }
      next.delayMs = Math.trunc(raw.delayMs);
    }

    if ('delayVenueId' in raw) {
      if (raw.delayVenueId !== null && !isVenueId(raw.delayVenueId)) {
        throw new BadRequestException({
          error: 'INVALID_DELAY_VENUE',
          message: 'delayVenueId must be A1, A2, B1, or null.',
        });
      }
      next.delayVenueId = raw.delayVenueId;
    }

    if ('force500' in raw) {
      if (typeof raw.force500 !== 'boolean') {
        throw new BadRequestException({
          error: 'INVALID_FORCE_500',
          message: 'force500 must be a boolean.',
        });
      }
      next.force500 = raw.force500;
    }

    if ('force500Remaining' in raw) {
      if (
        typeof raw.force500Remaining !== 'number' ||
        !Number.isInteger(raw.force500Remaining) ||
        raw.force500Remaining < 0 ||
        raw.force500Remaining > 20
      ) {
        throw new BadRequestException({
          error: 'INVALID_FORCE_500_REMAINING',
          message: 'force500Remaining must be an integer between 0 and 20.',
        });
      }
      next.force500Remaining = raw.force500Remaining;
    }

    if ('neverComplete' in raw) {
      if (typeof raw.neverComplete !== 'boolean') {
        throw new BadRequestException({
          error: 'INVALID_NEVER_COMPLETE',
          message: 'neverComplete must be a boolean.',
        });
      }
      next.neverComplete = raw.neverComplete;
    }

    if ('forceRetryFail' in raw) {
      if (typeof raw.forceRetryFail !== 'boolean') {
        throw new BadRequestException({
          error: 'INVALID_FORCE_RETRY_FAIL',
          message: 'forceRetryFail must be a boolean.',
        });
      }
      next.forceRetryFail = raw.forceRetryFail;
    }

    this.config = next;
    return this.getConfig();
  }

  resetConfig(): StubConfig {
    this.config = { ...DEFAULT_STUB_CONFIG };
    return this.getConfig();
  }

  async applyFaultsAndDelay(targetVenueId?: VenueId): Promise<void> {
    const shouldDelay =
      this.config.delayMs > 0 &&
      (this.config.delayVenueId === null || this.config.delayVenueId === targetVenueId);

    if (shouldDelay) {
      await sleep(this.config.delayMs);
    }

    if (this.config.force500) {
      throw new InternalServerErrorException({
        error: 'FORCED_STUB_500',
        message: 'Simulated upstream server failure (forced500 mode).',
      });
    }

    if (this.config.force500Remaining > 0) {
      this.config.force500Remaining -= 1;
      throw new InternalServerErrorException({
        error: 'FORCED_STUB_500',
        message: 'Simulated transient server failure. Retry the request to recover.',
      });
    }
  }
}
