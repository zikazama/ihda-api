import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestLoggingMiddleware } from './common/structured-logger';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { SessionModule } from './session/session.module';
import { StubModule } from './stub/stub.module';

@Module({
  imports: [HealthModule, SessionModule, JobsModule, StubModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
