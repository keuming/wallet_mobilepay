import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SimulatedCardAdapter } from './providers/card-provider.interface';

const MAX_SERIALIZATION_RETRIES = 3;

@Injectable()
export class CardsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private cardProvider: SimulatedCardAdapter,
  ) {}

  /**
   * Émet une carte virtuelle pour un particulier OU un marchand (jamais les
   * deux). Le titulaire doit fournir un nom (pour l'embossage côté partenaire) ;
   * aucune donnée de carte sensible n'est générée côté MobilePay — tout vient
   * de la réponse du partenaire (simulée en local, voir SimulatedCardAdapter).
   */
  async issueCard(params: {
    ownerUserId?: string;
    ownerMerchantId?: string;
    holderName: string;
    issuer: 'UNION33' | 'ONAFRIQ' | 'OTHER';
  }) {
    if (!params.ownerUserId && !params.ownerMerchantId) {
      throw new BadRequestException('Une carte doit être rattachée à un utilisateur ou un marchand.');
    }

    const result = await this.cardProvider.issueCard({
      holderName: params.holderName,
      currency: 'XOF',
      reference: crypto.randomUUID(),
    });

    return this.prisma.virtualCard.create({
      data: {
        ownerUserId: params.ownerUserId,
        ownerMerchantId: params.ownerMerchantId,
        issuer: params.issuer,
        providerRef: result.providerRef,
        maskedPan: result.maskedPan,
        expiryMonth: result.expiryMonth,
        expiryYear: result.expiryYear,
        status: result.status,
      },
    });
  }

  /** Cartes détenues par l'utilisateur, en son nom propre ou via un marchand rattaché. */
  async listMine(userId: string) {
    const merchantLinks = await this.prisma.merchantUser.findMany({ where: { userId } });
    const merchantIds = merchantLinks.map((l) => l.merchantId);

    return this.prisma.virtualCard.findMany({
      where: {
        OR: [{ ownerUserId: userId }, { ownerMerchantId: { in: merchantIds } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertOwnership(cardId: string, userId: string) {
    const card = await this.prisma.virtualCard.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Carte introuvable.');

    if (card.ownerUserId === userId) return card;

    if (card.ownerMerchantId) {
      const link = await this.prisma.merchantUser.findUnique({
        where: { merchantId_userId: { merchantId: card.ownerMerchantId, userId } },
      });
      if (link) return card;
    }

    throw new ForbiddenException("Cette carte ne vous appartient pas.");
  }

  /**
   * Charge la carte depuis le wallet du titulaire (§ modèle prépayé) : débite
   * le wallet via le ledger comptable, crédite `card.balance` dans la même
   * transaction SERIALIZABLE.
   */
  async loadCard(cardId: string, userId: string, amount: bigint, idempotencyKey: string) {
    const card = await this.assertOwnership(cardId, userId);
    if (card.status !== 'ACTIVE') {
      throw new BadRequestException('Cette carte n\'est pas active.');
    }

    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const walletOwnerId = card.ownerUserId ?? undefined;
    const walletMerchantId = card.ownerMerchantId ?? undefined;

    return this.runSerializable(async (tx) => {
      const wallet = walletOwnerId
        ? await tx.wallet.findUniqueOrThrow({ where: { userId: walletOwnerId } })
        : await tx.wallet.findUniqueOrThrow({ where: { merchantId: walletMerchantId } });

      const transaction = await tx.transaction.create({
        data: {
          type: 'CARD_LOAD',
          status: 'SUCCESS',
          amount,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Chargement carte ${card.maskedPan ?? ''}`,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount,
        description: 'Chargement carte virtuelle',
      });

      await tx.virtualCard.update({
        where: { id: cardId },
        data: { balance: { increment: amount } },
      });

      return transaction;
    });
  }

  async freezeCard(cardId: string, userId: string) {
    const card = await this.assertOwnership(cardId, userId);
    await this.cardProvider.freezeCard(card.providerRef ?? '');
    return this.prisma.virtualCard.update({ where: { id: cardId }, data: { status: 'FROZEN' } });
  }

  async unfreezeCard(cardId: string, userId: string) {
    const card = await this.assertOwnership(cardId, userId);
    await this.cardProvider.unfreezeCard(card.providerRef ?? '');
    return this.prisma.virtualCard.update({ where: { id: cardId }, data: { status: 'ACTIVE' } });
  }

  // --- Admin ---

  async adminList(status?: string) {
    return this.prisma.virtualCard.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        ownerUser: { select: { firstName: true, lastName: true, phone: true } },
        ownerMerchant: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async adminFreeze(cardId: string, freeze: boolean) {
    const card = await this.prisma.virtualCard.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Carte introuvable.');
    if (freeze) await this.cardProvider.freezeCard(card.providerRef ?? '');
    else await this.cardProvider.unfreezeCard(card.providerRef ?? '');
    return this.prisma.virtualCard.update({
      where: { id: cardId },
      data: { status: freeze ? 'FROZEN' : 'ACTIVE' },
    });
  }

  private async runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (err: any) {
        const isConflict = err?.code === 'P2034' || err?.meta?.code === '40001';
        if (isConflict && attempt < MAX_SERIALIZATION_RETRIES) continue;
        throw err;
      }
    }
    throw new BadRequestException('Échec après plusieurs tentatives, veuillez réessayer.');
  }
}
