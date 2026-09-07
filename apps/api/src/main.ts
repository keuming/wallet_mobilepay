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
    cors: {
      // § Corrigé à l'audit pré-production (APK Expo) : une application
      // mobile NATIVE n'envoie pas d'en-tête `Origin` (ou en envoie une que
      // la liste blanche ne contient pas). Avec une vérification stricte,
      // les APK particulier/marchand auraient été bloqués par CORS en
      // production — un problème invisible en test navigateur, découvert
      // seulement après distribution des APK.
      //
      // CORS est une protection propre au NAVIGATEUR : l'absence d'Origin
      // signifie une requête non-navigateur (app native, appel serveur),
      // qui n'est pas concernée par les attaques que CORS empêche. La
      // sécurité réelle de ces appels reste assurée par le JWT, les gardes
      // et le rate-limiting — pas par CORS.
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // client natif (Expo/APK) ou appel serveur
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origine non autorisée par CORS : ${origin}`), false);
      },
      credentials: true,
    },
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

  // § Corrigé à l'audit pré-production : l'API tourne derrière le proxy de
  // Render. Sans "trust proxy", Express voit l'IP DU PROXY pour toutes les
  // requêtes au lieu de celle du vrai client — le rate-limiting comptait
  // donc tous les utilisateurs comme une seule et même IP. Concrètement :
  // soit un seul utilisateur actif bloquait tous les autres, soit (pire) la
  // protection anti-force-brute sur /auth/login devenait inopérante.
  // Valeur 1 = fait confiance au premier proxy en amont (Render), sans
  // accepter aveuglément une chaîne X-Forwarded-For falsifiée par le client.
  app.set('trust proxy', 1);

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
