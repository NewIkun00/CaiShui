import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './shared/http-exception.filter.js';
import { createOpenApiDocument } from './openapi/document.js';

async function bootstrap(): Promise<void> {
  const production = process.env['NODE_ENV'] === 'production';
  if (production && process.env['AUTH_MODE'] === 'development-headers') {
    throw new Error('development-headers authentication is forbidden in production');
  }
  if (production && process.env['STORAGE_MODE'] === 'memory') {
    throw new Error('memory storage is forbidden in production');
  }
  const webOrigin = process.env['WEB_ORIGIN'];
  if (production && !webOrigin) throw new Error('WEB_ORIGIN is required in production');
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: 7_500_000 }), {
    bufferLogs: true,
  });
  await app.register(helmet);
  app.enableCors({
    origin: production ? webOrigin ?? false : true,
    allowedHeaders: ['content-type', 'x-user-id', 'x-tenant-id', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  app.getHttpAdapter().getInstance().addHook('onRequest', (request, reply, done) => {
    const incoming = request.headers['x-request-id'];
    const traceId = typeof incoming === 'string' ? incoming : randomUUID();
    request.headers['x-request-id'] = traceId;
    void reply.header('x-request-id', traceId);
    done();
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  await app.listen(Number(process.env['API_PORT'] ?? 3001), '0.0.0.0');
}

void bootstrap();
