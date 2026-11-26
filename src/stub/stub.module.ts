import { Module, forwardRef } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StubController } from './stub.controller';
import { StubService } from './stub.service';

@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [StubController],
  providers: [StubService],
  exports: [StubService],
})
export class StubModule {}
