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

    // Diagnostic temporaire (§ vérifier le vrai type de nextAction — ussd,
    // otp, ou redirection — renvoyé par chaque opérateur, avant de construire
    // l'étape d'authentification OTP à l'aveugle).
    const envelope = this.safeParse(rawBody) as any;
    if (envelope?.data?.nextAction) {
      // eslint-disable-next-line no-console
      console.log(
        `[NEXTACTION DEBUG] provider=${envelope.data.provider} type=${envelope.data.nextAction.type} message=${envelope.data.nextAction.message}`,
      );
      // eslint-disable-next-line no-console
      console.log('[NEXTACTION DEBUG] objet complet:', JSON.stringify(envelope.data.nextAction));
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

    // On ne finalise QUE sur un statut final réel (SUCCESS ou FAILED) — les
    // événements intermédiaires (ex: "payment.pending", "payment.action_required",
    // statut PENDING) ne doivent jamais clôturer la transaction. Bug corrigé
    // ici : avant, tout événement ≠ SUCCESS était traité comme un échec
    // immédiat, clôturant la transaction en FAILED dès le premier webhook
    // reçu, avant même que le client ait pu confirmer son paiement.
    if (verification.status === 'PENDING') {
      // L'événement "action_required" est le seul moment où HUB2 nous dit
      // COMMENT le client doit confirmer (ussd/otp/redirection) — on
      // persiste cette info pour que le frontend puisse la découvrir en
      // interrogeant la transaction (elle n'est jamais dans la réponse HTTP
      // immédiate de la tentative de paiement, seulement ici).
      const nextAction = envelope?.data?.nextAction;
      if (nextAction) {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            nextActionType: nextAction.type,
            nextActionMessage: nextAction.message,
            nextActionUrl: nextAction.data?.url,
          },
        });
      }
      this.logger.log(`Webhook HUB2 : événement intermédiaire (${verification.eventType}) — transaction non finalisée.`);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { received: true, matched: true, final: false };
    }

    if (transaction.type === 'TOPUP') {
      await this.paymentEngine.completeTopup(
        transaction.id,
        verification.status === 'SUCCESS',
        verification.failureReason,
      );
    }
    if (transaction.type === 'WITHDRAWAL') {
      await this.paymentEngine.completeWithdrawal(
        transaction.id,
        verification.status === 'SUCCESS',
        verification.failureReason,
      );
    }
    if (transaction.type === 'PAYMENT' && transaction.providerName === 'HUB2') {
      await this.paymentEngine.completeExternalMerchantPayment(
        transaction.id,
        verification.status === 'SUCCESS',
        verification.failureReason,
      );
    }

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
