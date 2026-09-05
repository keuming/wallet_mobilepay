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
    // L'idempotence s'applique à toutes les routes qui déplacent de l'argent.
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        'api/wallets/transfer',
        'api/merchants/:merchantId/payment-requests',
        'api/qr/:code/pay',
        'api/payment-links/:slug/pay',
        'api/wallets/topup',
        'api/wallets/withdraw',
        'api/airtime',
        'api/cards/:id/load',
      );
  }
}
