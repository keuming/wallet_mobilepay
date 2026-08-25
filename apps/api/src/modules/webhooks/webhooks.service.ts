import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { Hub2Adapter } from '../payment-engine/providers/hub2.adapter';
import { PaymentEngineService } from '../payment-engine/payment-engine.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('WebhooksService');

  constructor(
    private prisma: PrismaService,
    private hub2: Hub2Adapter,
    private paymentEngine: PaymentEngineService,
  ) {}

  /**
   * Traite un webhook HUB2 :
   * 1. Vérifie la signature HMAC (rejet immédiat si invalide — §34 "signature des webhooks")
   * 2. Journalise l'événement tel quel (§26 "journalisation") avant tout traitement métier
   * 3. Idempotence : si ce `providerRef` a déjà été traité avec succès, on ne rejoue rien
   * 4. Dispatch vers PaymentEngineService pour finaliser la transaction interne
   */
  async processHub2Webhook(rawBody: string, signature: string) {
    const verification = this.hub2.verifyWebhook(rawBody, signature);

    if (!verification.isValid) {
      // On journalise même les signatures invalides — utile pour détecter une
      // tentative d'usurpation ou un secret mal configuré côté HUB2.
      await this.prisma.webhookEvent.create({
        data: {
          providerName: 'HUB2',
          eventType: 'unknown',
          status: 'REJECTED_BAD_SIGNATURE',
          payload: this.safeParse(rawBody) as Prisma.InputJsonValue,
          signature,
        },
      });
      this.logger.warn('Webhook HUB2 rejeté : signature invalide.');
      throw new UnauthorizedException('Signature invalide.');
    }

    const transaction = await this.prisma.transaction.findFirst({
      where: { providerRef: verification.providerRef, providerName: 'HUB2' },
    });

    const event = await this.prisma.webhookEvent.create({
      data: {
        providerName: 'HUB2',
        eventType: verification.eventType,
        status: 'VERIFIED',
        payload: this.safeParse(rawBody) as Prisma.InputJsonValue,
        signature,
        transactionId: transaction?.id,
      },
    });

    if (!transaction) {
      this.logger.warn(`Webhook HUB2 : aucune transaction pour providerRef=${verification.providerRef}`);
      return { received: true, matched: false };
    }

    if (transaction.type === 'TOPUP') {
      await this.paymentEngine.completeTopup(
        transaction.id,
        verification.status === 'SUCCESS',
        verification.failureReason,
      );
    }
    // WITHDRAWAL et REFUND suivraient le même pattern via des méthodes dédiées
    // de PaymentEngineService, à ajouter en Phase 5 lors du branchement complet
    // du cash-out.

    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    return { received: true, matched: true };
  }

  private safeParse(rawBody: string): unknown {
    try {
      return JSON.parse(rawBody);
    } catch {
      return { raw: rawBody };
    }
  }
}
