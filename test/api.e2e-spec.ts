import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/swagger/swagger.setup';

describe('Integration Health API (NestJS stub)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    setupSwagger(app);
    await app.init();
  });

  beforeEach(async () => {
    await request(app.getHttpServer()).post('/api/stub/reset').expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns service health status', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'ihda-api' });
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/api/session').expect(401);
    await request(app.getHttpServer()).get('/api/jobs').expect(401);
    await request(app.getHttpServer()).post('/api/jobs/j1/retry').expect(401);
  });

  it('supports happy path for operator-A: filter, retry j1 -> QUEUED -> HEALTHY after 2 polls', async () => {
    const sessionRes = await request(app.getHttpServer())
      .get('/api/session')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    expect(sessionRes.body).toMatchObject({
      tenantId: 'A',
      venueIds: ['A1', 'A2'],
      role: 'operator',
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/jobs?venueId=A1')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0]).toMatchObject({
      id: 'j1',
      venueId: 'A1',
      provider: 'Mock POS',
      status: 'FAILED',
    });

    const retryRes = await request(app.getHttpServer())
      .post('/api/jobs/j1/retry')
      .set('Authorization', 'Bearer operator-A')
      .expect(202);
    expect(retryRes.body).toEqual({ jobId: 'j1', status: 'QUEUED' });

    const poll1 = await request(app.getHttpServer())
      .get('/api/jobs/j1')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    expect(poll1.body).toMatchObject({ id: 'j1', status: 'QUEUED', pollCount: 1 });

    const poll2 = await request(app.getHttpServer())
      .get('/api/jobs/j1')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    expect(poll2.body).toMatchObject({ id: 'j1', status: 'HEALTHY', lastError: null });
    expect(typeof poll2.body.lastSuccessAt).toBe('string');
  });

  it('enforces viewer role on server (403 on retry without mutating j1)', async () => {
    await request(app.getHttpServer())
      .get('/api/jobs?venueId=A1')
      .set('Authorization', 'Bearer viewer-A')
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/jobs/j1/retry')
      .set('Authorization', 'Bearer viewer-A')
      .expect(403);

    const after = await request(app.getHttpServer())
      .get('/api/jobs/j1')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    expect(after.body.status).toBe('FAILED');
  });

  it('enforces strict tenant isolation across list, read, and retry', async () => {
    const listA = await request(app.getHttpServer())
      .get('/api/jobs')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    const idsA = (listA.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(idsA).toEqual(['j1', 'j2']);

    await request(app.getHttpServer())
      .get('/api/jobs?venueId=B1')
      .set('Authorization', 'Bearer operator-A')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/jobs/j3')
      .set('Authorization', 'Bearer operator-A')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/jobs/j3/retry')
      .set('Authorization', 'Bearer operator-A')
      .expect(403);

    const listB = await request(app.getHttpServer())
      .get('/api/jobs')
      .set('Authorization', 'Bearer operator-B')
      .expect(200);
    expect(listB.body.items).toHaveLength(1);
    expect(listB.body.items[0]).toMatchObject({
      id: 'j3',
      venueId: 'B1',
      provider: 'Mock Reservations',
      status: 'FAILED',
      lastSuccessAt: null,
    });

    await request(app.getHttpServer())
      .get('/api/jobs/j1')
      .set('Authorization', 'Bearer operator-B')
      .expect(403);
  });

  it('rejects concurrent duplicate retries with 409 and accepts at most one active retry', async () => {
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/jobs/j1/retry')
        .set('Authorization', 'Bearer operator-A'),
      request(app.getHttpServer())
        .post('/api/jobs/j1/retry')
        .set('Authorization', 'Bearer operator-A'),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([202, 409]);

    await request(app.getHttpServer())
      .post('/api/jobs/j1/retry')
      .set('Authorization', 'Bearer operator-A')
      .expect(409);
  });

  it('supports deterministic forced500 recovery, neverComplete, and scoped delay modes', async () => {
    await request(app.getHttpServer())
      .post('/api/stub/config')
      .send({ force500Remaining: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/jobs?venueId=A1')
      .set('Authorization', 'Bearer operator-A')
      .expect(500);

    const recovered = await request(app.getHttpServer())
      .get('/api/jobs?venueId=A1')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    expect(recovered.body.items[0].id).toBe('j1');

    await request(app.getHttpServer())
      .post('/api/stub/config')
      .send({ neverComplete: true })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/jobs/j1/retry')
      .set('Authorization', 'Bearer operator-A')
      .expect(202);

    for (let i = 0; i < 4; i += 1) {
      const pollRes = await request(app.getHttpServer())
        .get('/api/jobs/j1')
        .set('Authorization', 'Bearer operator-A')
        .expect(200);
      expect(pollRes.body.status).toBe('QUEUED');
    }

    await request(app.getHttpServer())
      .post('/api/stub/config')
      .send({ delayMs: 120, delayVenueId: 'A1' })
      .expect(200);

    const t0 = Date.now();
    await request(app.getHttpServer())
      .get('/api/jobs?venueId=A1')
      .set('Authorization', 'Bearer operator-A')
      .expect(200);
    const elapsedA1 = Date.now() - t0;
    expect(elapsedA1).toBeGreaterThanOrEqual(100);
  });

  it('supports synthetic session cookie login via POST /api/session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/session').send({ sessionId: 'viewer-A' }).expect(200);

    const sessionRes = await agent.get('/api/session').expect(200);
    expect(sessionRes.body.role).toBe('viewer');

    await agent.post('/api/jobs/j1/retry').expect(403);
  });

  it('serves Swagger UI and OpenAPI JSON with sample requests and responses', async () => {
    const uiRes = await request(app.getHttpServer()).get('/docs/').expect(200);
    expect(uiRes.text).toContain('Swagger UI');

    const jsonRes = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const doc = jsonRes.body as {
      openapi: string;
      paths: Record<string, Record<string, {
        requestBody?: { content?: Record<string, { examples?: Record<string, unknown> }> };
        responses?: Record<string, { content?: Record<string, { example?: unknown; examples?: Record<string, unknown> }> }>;
      }>>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.components?.securitySchemes).toHaveProperty('bearer-session');
    expect(doc.components?.securitySchemes).toHaveProperty('cookie-session');

    for (const apiPath of [
      '/health',
      '/api/session',
      '/api/jobs',
      '/api/jobs/{id}',
      '/api/jobs/{id}/retry',
      '/api/stub/config',
      '/api/stub/reset',
    ]) {
      expect(doc.paths).toHaveProperty(apiPath);
    }

    const sessionPost = doc.paths['/api/session']?.post;
    expect(sessionPost?.requestBody?.content?.['application/json']?.examples).toHaveProperty('operatorA');
    expect(sessionPost?.responses?.['200']?.content?.['application/json']?.examples).toHaveProperty('operatorASession');

    const jobsGet = doc.paths['/api/jobs']?.get;
    expect(jobsGet?.responses?.['200']?.content?.['application/json']?.examples).toHaveProperty('tenantAAll');
    expect(jobsGet?.responses?.['403']?.content?.['application/json']?.example).toMatchObject({ error: 'FORBIDDEN' });

    const retryPost = doc.paths['/api/jobs/{id}/retry']?.post;
    expect(retryPost?.responses?.['202']?.content?.['application/json']?.example).toEqual({
      jobId: 'j1',
      status: 'QUEUED',
    });
    expect(retryPost?.responses?.['409']?.content?.['application/json']?.examples).toHaveProperty('retryAlreadyActive');

    const stubConfigPost = doc.paths['/api/stub/config']?.post;
    expect(stubConfigPost?.requestBody?.content?.['application/json']?.examples).toHaveProperty('delayA1');
    expect(stubConfigPost?.responses?.['200']?.content?.['application/json']?.examples).toHaveProperty(
      'forced500OnceResponse',
    );
  });
});
