// First import on purpose: sets the process timezone before any other module
// is evaluated. See timezone.bootstrap.ts.
import './timezone.bootstrap';

import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import { AppModule } from './app.module';

// Prisma returns BigInt for UNIX timestamp columns; make them JSON-safe.
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Streaming servers post events in batches, which outgrow the 100kb default.
  app.useBodyParser('json', { limit: '5mb' });
  const config = app.get(ConfigService);

  // ---- Security headers ----
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow serving /uploads to the frontend origin
    }),
  );
  app.disable('x-powered-by');

  // ---- Cookies (refresh token / CSRF) ----
  app.use(cookieParser());

  // ---- CORS restrictions ----
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-device-type',
      'x-csrf-token',
    ],
  });

  // ---- API versioning: /api/v{API_VERSION}/... ----
  const apiVersion = config.get('API_VERSION', '1');
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: apiVersion });

  // ---- Local storage static serving (driver=local) ----
  app.useStaticAssets(
    path.join(process.cwd(), config.get('LOCAL_STORAGE_DIR', 'public/uploads')),
    { prefix: '/uploads' },
  );

  // ---- Swagger / OpenAPI ----
  if (config.get('SWAGGER_ENABLED', 'true') === 'true') {
    patchNestJsSwagger(); // teach Swagger to read Zod DTO schemas
    const swaggerConfig = new DocumentBuilder()
      .setTitle(config.get('APP_NAME', 'System API'))
      .setDescription(
        `System REST API. All endpoints are versioned under /api/v${apiVersion} and ` +
          'require the x-device-type header. Protected endpoints use a JWT ' +
          'Bearer access token; refresh tokens are httpOnly cookies with ' +
          'CSRF double-submit protection.',
      )
      .setVersion('1.5.0')
      .addBearerAuth()
      .addGlobalParameters({
        name: 'x-device-type',
        in: 'header',
        required: true,
        description: 'Calling device type',
        schema: {
          type: 'string',
          enum: ['website', 'androidApp', 'iosApp', 'desktopApp'],
          default: 'website',
        },
      })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(config.get('SWAGGER_PATH', 'docs'), app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = parseInt(config.get('PORT', '4000'), 10);
  await app.listen(port);
  Logger.log(`API running on http://localhost:${port}/api/v${apiVersion}`, 'Bootstrap');
  Logger.log(`Swagger docs on http://localhost:${port}/${config.get('SWAGGER_PATH', 'docs')}`, 'Bootstrap');
}

bootstrap();
