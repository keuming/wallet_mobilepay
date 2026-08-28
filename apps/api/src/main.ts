import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  // CORS restreint à une liste blanche d'origines (variable d'env
  // CORS_ALLOWED_ORIGINS, séparées par des virgules) — indispensable en
  // production pour ne pas autoriser n'importe quel site à appeler l'API
  // avec les cookies/credentials. En local, on retombe sur les 3 ports
  // habituels si la variable n'est pas définie.
  const allowedOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3001,http://localhost:3002,http://localhost:3003'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: { origin: allowedOrigins, credentials: true },
    rawBody: true,
  });

  // Limite relevée pour accepter les pièces jointes KYC encodées en base64
  // (recto/verso pièce d'identité + selfie) — le défaut (100kb) est bien trop
  // restrictif pour des photos. `useBodyParser` reste compatible avec la
  // capture `rawBody` utilisée par les webhooks HUB2 (contrairement à un
  // `app.use(express.json())` manuel qui la casserait).
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });

  app.use(helmet());
  app.setGlobalPrefix('api');

  // Toute entrée est validée et nettoyée — aucune propriété inconnue tolérée.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('MobilePay CI API')
      .setDescription('API du MVP MobilePay CI — Particulier, Marchand, Agent, Admin')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MobilePay API démarrée sur le port ${port} (docs: /docs)`);
}

bootstrap();
