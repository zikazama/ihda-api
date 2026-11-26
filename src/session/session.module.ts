import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { SessionController } from './session.controller';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [SessionController],
  providers: [SessionService, SessionGuard, RolesGuard],
  exports: [SessionService, SessionGuard, RolesGuard],
})
export class SessionModule {}
