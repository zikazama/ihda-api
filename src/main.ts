import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logJson } from './common/structured-logger';
import { setupSwagger } from './swagger/swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  app.use(cookieParser());
  const corsOriginEnv = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const corsOrigins = corsOriginEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({
    origin: corsOrigins.length <= 1 ? (corsOrigins[0] ?? 'http://localhost:3000') : corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();
  setupSwagger(app);

  const portRaw = process.env.PORT ?? '4000';
  const port = Number.parseInt(portRaw, 10);
  const resolvedPort = Number.isFinite(port) ? port : 4000;
  await app.listen(resolvedPort, '0.0.0.0');
  logJson('info', 'server_listening', {
    port: resolvedPort,
    swaggerDocs: '/docs',
    openApiJson: '/docs-json',
  });
}

void bootstrap();
