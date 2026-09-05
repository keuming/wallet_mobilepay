import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/**
 * § Corrige une faille critique constatée à l'audit sécurité : le niveau
 * KYC (LEVEL_0 à LEVEL_3) existait en base sans jamais être appliqué comme
 * plafond de transaction — un compte totalement non vérifié pouvait envoyer
 * des montants illimités, exactement comme un compte pleinement vérifié.
 *
 * ⚠️ Les montants ci-dessous sont une PROPOSITION RAISONNABLE basée sur les
 * pratiques courantes UEMOA (KYC proportionnel), PAS une valeur officielle
 * confirmée pour ORZAYAH CI — à valider contre l'accord BCEAO réel de
 * l'entreprise et ajuster si besoin. Le mécanisme d'application, lui, est
 * bien réel et fonctionnel dès maintenant.
 */
const MONTHLY_LIMITS_FCFA: Record<string, number> = {
  LEVEL_0: 50_000,
  LEVEL_1: 200_000,
  LEVEL_2: 2_000_000,
  LEVEL_3: 10_000_000,
};

// Types de transaction comptés comme "sortants" pour le calcul du plafond
// mensuel — tout ce qui quitte réellement le wallet vers l'extérieur ou
// vers un tiers (une collecte/épargne interne n'est pas comptée : l'argent
// reste dans l'écosystème MobilePay, ce n'est pas une "dépense").
const OUTGOING_TYPES = ['TRANSFER', 'WITHDRAWAL', 'PAYMENT', 'AIRTIME', 'GIFT_CARD', 'UTILITY_PAYMENT'];

@Injectable()
export class KycLimitsService {
  constructor(private prisma: PrismaService) {}

  /** Lève une exception si `amount` (en centimes) dépasserait le plafond
   * mensuel du niveau KYC de l'utilisateur, compte tenu de ce qu'il a déjà
   * envoyé ce mois-ci. */
  async assertWithinMonthlyLimit(userId: string, amount: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limitFcfa = MONTHLY_LIMITS_FCFA[user.kycLevel] ?? MONTHLY_LIMITS_FCFA.LEVEL_0;
    const limitCents = BigInt(limitFcfa) * 100n;

    const startOfMonth = new Date();
    startOfMonth.setDate(startOfMonth.getDate() - 30); // fenêtre glissante de 30 jours

    // § Basé sur l'initiateur (pas uniquement le wallet) — un paiement par
    // carte virtuelle ne débite jamais le wallet directement
    // (sourceWalletId: null dans ce cas précis) mais doit compter tout
    // autant dans le plafond mensuel réel de l'utilisateur.
    const sent = await this.prisma.transaction.aggregate({
      where: {
        initiatedByUserId: userId,
        type: { in: OUTGOING_TYPES as any },
        status: 'SUCCESS',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    const alreadySent = sent._sum.amount ?? 0n;
    if (alreadySent + amount > limitCents) {
      const remainingFcfa = Math.max(0, Number(limitCents - alreadySent) / 100);
      throw new BadRequestException(
        `Plafond mensuel atteint pour votre niveau de vérification (${limitFcfa.toLocaleString('fr-FR')} FCFA). ` +
          `Il vous reste ${remainingFcfa.toLocaleString('fr-FR')} FCFA disponibles ce mois-ci. ` +
          `Augmentez votre niveau de vérification pour un plafond plus élevé (menu → Augmenter mes plafonds).`,
      );
    }
  }
}
