import { Module, forwardRef } from '@nestjs/common';
import { StubModule } from '../stub/stub.module';
import { JobsController } from './jobs.controller';
import { InMemoryJobsRepository, JOBS_REPOSITORY } from './jobs.repository';
import { JobsService } from './jobs.service';

@Module({
  imports: [forwardRef(() => StubModule)],
  controllers: [JobsController],
  providers: [
    JobsService,
    {
      provide: JOBS_REPOSITORY,
      useClass: InMemoryJobsRepository,
    },
  ],
  exports: [JOBS_REPOSITORY],
})
export class JobsModule {}
