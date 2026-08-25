import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
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

  async getHistory(userId: string, page = 1, pageSize = 20) {
    const wallet = await this.getWalletByUserId(userId);
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { transaction: true },
      }),
      this.prisma.ledgerEntry.count({ where: { walletId: wallet.id } }),
    ]);
    return { entries, total, page, pageSize };
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
      this.prisma.user.findUnique({ where: { phone: dto.toPhone } }),
    ]);

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
