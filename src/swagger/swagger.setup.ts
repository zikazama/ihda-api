import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Integration Health Dashboard API (ihda-api)')
    .setDescription(
      [
        'NestJS TypeScript API stub for the Integration Health Dashboard.',
        '',
        'Authenticate using either:',
        '- Bearer token header: operator-A (Tenant A operator), viewer-A (Tenant A viewer), or operator-B (Tenant B operator)',
        '- HttpOnly cookie ihda_session via POST /api/session',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'SyntheticSessionId',
        description: 'Enter one of: operator-A, viewer-A, operator-B',
      },
      'bearer-session',
    )
    .addCookieAuth(
      'ihda_session',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'ihda_session',
        description: 'Synthetic session cookie set by POST /api/session',
      },
      'cookie-session',
    )
    .addTag('Health', 'Service liveness check')
    .addTag('Session', 'Synthetic session inspection and cookie switching')
    .addTag('Jobs', 'Tenant-scoped integration health jobs and safe retries')
    .addTag('Stub Controls', 'Deterministic delay, forced 500, never-complete, and fixture reset')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  return document;
}
