import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { normalizePhoneCandidates } from '../../common/utils/phone.util';
import { TransferDto } from './dto/wallets.dto';

const MAX_SERIALIZATION_RETRIES = 3;

@Injectable()
export class WalletsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  async getWalletByUserId(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet introuvable.');
    return wallet;
  }

  async getHistory(userId: string, page = 1, pageSize = 20, search?: string) {
    const wallet = await this.getWalletByUserId(userId);

    // Si une recherche est fournie, on résout d'abord les wallets correspondant
    // à ce nom/numéro (particulier ou marchand), pour ne remonter que les
    // transactions impliquant ce correspondant précis — utile pour une
    // investigation ciblée sur une transaction.
    let counterpartyWalletIds: string[] | null = null;
    if (search && search.trim()) {
      const term = search.trim();
      const [matchingUsers, matchingMerchants] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            OR: [
              { phone: { contains: term, mode: 'insensitive' } },
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
            ],
          },
          select: { wallet: { select: { id: true } } },
        }),
        this.prisma.merchant.findMany({
          where: { businessName: { contains: term, mode: 'insensitive' } },
          select: { wallet: { select: { id: true } } },
        }),
      ]);
      counterpartyWalletIds = [...matchingUsers, ...matchingMerchants]
        .map((m) => m.wallet?.id)
        .filter((id): id is string => !!id);

      // Aucun correspondant trouvé pour ce terme : on ne renvoie rien plutôt
      // que de rendre l'historique complet (éviterait un faux sentiment de
      // recherche fonctionnelle).
      if (counterpartyWalletIds.length === 0) {
        return { entries: [], total: 0, page, pageSize };
      }
    }

    const where: Prisma.LedgerEntryWhereInput = {
      walletId: wallet.id,
      ...(counterpartyWalletIds
        ? {
            transaction: {
              OR: [
                { sourceWalletId: { in: counterpartyWalletIds } },
                { destWalletId: { in: counterpartyWalletIds } },
              ],
            },
          }
        : {}),
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { transaction: true },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    const enriched = await Promise.all(entries.map((entry) => this.resolveCounterparty(entry, wallet.id)));

    return { entries: enriched, total, page, pageSize };
  }

  /**
   * Détermine et résout le "correspondant" d'une écriture — l'autre partie de
   * la transaction (destinataire si on a été débité, expéditeur si on a été
   * crédité). Nécessaire pour une vue investigation claire de l'historique.
   */
  private async resolveCounterparty(
    entry: Prisma.LedgerEntryGetPayload<{ include: { transaction: true } }>,
    ownWalletId: string,
  ) {
    const { sourceWalletId, destWalletId } = entry.transaction;
    const otherWalletId =
      sourceWalletId === ownWalletId ? destWalletId : destWalletId === ownWalletId ? sourceWalletId : null;

    if (!otherWalletId || otherWalletId === ownWalletId) {
      return { ...entry, counterparty: null };
    }

    const otherWallet = await this.prisma.wallet.findUnique({
      where: { id: otherWalletId },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
        merchant: { select: { businessName: true } },
      },
    });

    if (!otherWallet) return { ...entry, counterparty: null };

    const counterparty = otherWallet.user
      ? { type: 'PARTICULIER' as const, name: `${otherWallet.user.firstName} ${otherWallet.user.lastName}`, phone: otherWallet.user.phone }
      : otherWallet.merchant
        ? { type: 'MERCHANT' as const, name: otherWallet.merchant.businessName, phone: null }
        : null;

    return { ...entry, counterparty };
  }

  /**
   * Transfert particulier -> particulier (§4, §33 POST /api/transfers).
   *
   * Idempotence : la contrainte UNIQUE sur `Transaction.idempotencyKey` garantit
   * que rejouer la même requête (même clé) ne débite jamais deux fois. Si la
   * transaction existe déjà, on la renvoie telle quelle sans rien recréer.
   *
   * Concurrence : exécuté dans une transaction Postgres SERIALIZABLE avec retry
   * automatique — c'est le niveau d'isolation le plus strict, indispensable pour
   * de l'argent.
   */
  async transfer(senderId: string, dto: TransferDto, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;

    const [sender, recipientUser] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: senderId } }),
      // § Le destinataire peut être dans un autre pays que l'expéditeur —
      // on essaie chaque pays supporté plutôt que de supposer 'CI'.
      this.prisma.user.findFirst({ where: { phone: { in: normalizePhoneCandidates(dto.toPhone) } } }),
    ]);

    if (!sender.transactionPinHash) {
      throw new BadRequestException(
        'Vous devez créer un code secret avant d\'envoyer de l\'argent (menu → Modifier mon code secret).',
      );
    }
    if (!(await bcrypt.compare(dto.pin, sender.transactionPinHash))) {
      throw new UnauthorizedException('Code secret incorrect.');
    }

    if (!recipientUser) {
      throw new NotFoundException('Aucun compte MobilePay associé à ce numéro.');
    }
    if (recipientUser.id === senderId) {
      throw new BadRequestException('Vous ne pouvez pas vous envoyer de l\'argent à vous-même.');
    }

    const amount = BigInt(dto.amount);

    return this.runSerializable(async (tx) => {
      const senderWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: senderId } });
      const recipientWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: recipientUser.id },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          status: 'SUCCESS',
          amount,
          sourceWalletId: senderWallet.id,
          destWalletId: recipientWallet.id,
          initiatedByUserId: senderId,
          description: dto.description ?? `Transfert vers ${recipientUser.firstName}`,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: senderWallet.id,
        toWalletId: recipientWallet.id,
        amount,
        description: dto.description ?? 'Transfert P2P',
      });

      return transaction;
    });
  }

  /**
   * Exécute une opération dans une transaction SERIALIZABLE avec retry en cas
   * de conflit de sérialisation (code Postgres 40001) — pattern standard pour
   * les opérations financières à forte concurrence.
   */
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (err: any) {
        const isSerializationConflict = err?.code === 'P2034' || err?.meta?.code === '40001';
        if (isSerializationConflict && attempt < MAX_SERIALIZATION_RETRIES) {
          continue; // retry
        }
        if (isSerializationConflict) {
          throw new ConflictException(
            'Opération en conflit avec une autre transaction concurrente, veuillez réessayer.',
          );
        }
        throw err;
      }
    }
    throw new ConflictException('Échec après plusieurs tentatives, veuillez réessayer.');
  }
}
