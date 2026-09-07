import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './config/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { QrModule } from './modules/qr/qr.module';
import { PaymentEngineModule } from './modules/payment-engine/payment-engine.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { KycModule } from './modules/kyc/kyc.module';
import { AgentsModule } from './modules/agents/agents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { CardsModule } from './modules/cards/cards.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { SecurityModule } from './modules/security/security.module';
import { CollecteModule } from './modules/collecte/collecte.module';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), // 120 req/min/IP par défaut
    PrismaModule,
    AuthModule,
    UsersModule,
    LedgerModule,
    WalletsModule,
    MerchantsModule,
    TransactionsModule,
    QrModule,
    PaymentEngineModule,
    WebhooksModule,
    KycModule,
    AgentsModule,
    NotificationsModule,
    AdminModule,
    CardsModule,
    PricingModule,
    ExpensesModule,
    SecurityModule,
    CollecteModule,
  ],
  providers: [
    // § Corrige une faille critique constatée à l'audit sécurité : le
    // ThrottlerModule était configuré (120 req/min/IP) mais son garde
    // n'était enregistré nulle part — la limite n'était donc JAMAIS
    // appliquée, sur aucune route de l'API.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // L'idempotence s'applique à TOUTES les routes qui déplacent de l'argent.
    //
    // § Faille critique corrigée à l'audit pré-production : 13 routes
    // financières utilisaient bien une clé d'idempotence dans leur code
    // mais n'étaient PAS couvertes par ce middleware — si le client ne
    // l'envoyait pas, `idempotencyKey` valait `undefined`, la recherche
    // d'une transaction existante ne trouvait jamais rien, et une NOUVELLE
    // transaction était créée à chaque appel. Concrètement : un double-clic
    // ou une requête rejouée sur réseau instable provoquait un DOUBLE DÉBIT
    // réel du client. Toute route financière doit figurer ici.
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        // Wallet particulier
        'api/wallets/transfer',
        'api/wallets/topup',
        'api/wallets/withdraw',
        'api/wallets/send-external',
        'api/airtime',
        'api/cards/:id/load',
        // Cartes cadeaux / factures (particulier)
        'api/gift-cards/orders',
        'api/utility-payments/pay',
        // QR / liens de paiement (connecté ET invité)
        'api/qr/:code/pay',
        'api/payment-links/:slug/pay',
        'api/qr/:code/pay-external',
        'api/payment-links/:slug/pay-external',
        // Collecte & Épargne
        'api/collecte/types/:id/deposit',
        'api/collecte/types/:id/withdraw',
        'api/savings/types/:id/deposit',
        'api/savings/types/:id/withdraw',
        'api/gold/deposit',
        'api/gold/withdraw',
        // Marchand
        'api/merchants/:merchantId/payment-requests',
        'api/merchants/:merchantId/transfer',
        'api/merchants/:merchantId/airtime',
        'api/merchants/:merchantId/debit-direct',
        'api/merchants/:merchantId/gift-cards/orders',
        'api/merchants/:merchantId/utility-payments/pay',
      );
  }
}
