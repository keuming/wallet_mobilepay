import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateMerchantDto } from './dto/merchants.dto';

const MAX_SERIALIZATION_RETRIES = 3;

@Injectable()
export class MerchantsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  /**
   * Crée le marchand + son wallet marchand + le rattache à l'utilisateur créateur
   * en tant que MERCHANT_ADMIN. Le marchand démarre en statut PENDING : il doit
   * passer le KYC (voir module kyc) avant activation par un agent ou un admin.
   */
  async create(userId: string, dto: CreateMerchantDto) {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          businessName: dto.businessName,
          legalName: dto.legalName,
          category: dto.category,
          status: 'PENDING',
        },
      });

      await tx.wallet.create({
        data: { type: 'MERCHANT', merchantId: merchant.id, currency: 'XOF' },
      });

      await tx.merchantUser.create({
        data: { merchantId: merchant.id, userId, role: 'MERCHANT_ADMIN' },
      });

      // Le QR statique du marchand est réservé mais pas encore actif tant que
      // le marchand n'est pas ACTIVE (voir §13 — activation automatique).
      await tx.qrCode.create({
        data: {
          code: `MPM${merchant.id.slice(0, 10).toUpperCase()}`,
          type: 'MERCHANT_STATIC',
          status: 'UNASSIGNED',
          merchantId: merchant.id,
        },
      });

      return merchant;
    });
  }

  async getWallet(merchantId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { merchantId } });
    if (!wallet) throw new NotFoundException('Wallet marchand introuvable.');
    return wallet;
  }

  /**
   * Transfert depuis le wallet marchand vers un particulier (§ dashboard
   * marchand — parcours Transfert). N'est possible que si l'admin a
   * explicitement autorisé ce marchand (Merchant.transfersEnabled) — sinon
   * refus immédiat, quel que soit le rôle de l'utilisateur qui l'initie.
   */
  async transferFromMerchant(
    merchantId: string,
    initiatedByUserId: string,
    dto: { toPhone: string; amount: number; description?: string },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (!merchant.transfersEnabled) {
      throw new BadRequestException(
        "Le transfert d'argent n'est pas autorisé pour ce marchand — contactez un administrateur MobilePay.",
      );
    }
    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException('Ce marchand doit être actif pour effectuer un transfert.');
    }

    const recipientUser = await this.prisma.user.findUnique({ where: { phone: dto.toPhone } });
    if (!recipientUser) {
      throw new NotFoundException('Aucun compte MobilePay associé à ce numéro.');
    }

    const amount = BigInt(dto.amount);

    return this.runSerializable(async (tx) => {
      const merchantWallet = await tx.wallet.findUniqueOrThrow({ where: { merchantId } });
      const recipientWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: recipientUser.id } });

      if (merchantWallet.cachedBalance < amount) {
        throw new BadRequestException('Solde insuffisant.');
      }

      const description = dto.description ?? `Transfert vers ${recipientUser.firstName}`;

      const transaction = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          status: 'SUCCESS',
          amount,
          sourceWalletId: merchantWallet.id,
          destWalletId: recipientWallet.id,
          initiatedByUserId,
          description,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: merchantWallet.id,
        toWalletId: recipientWallet.id,
        amount,
        description,
      });

      return transaction;
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
        if (isConflict) throw new ConflictException('Conflit de transaction, veuillez réessayer.');
        throw err;
      }
    }
    throw new ConflictException('Échec après plusieurs tentatives.');
  }

  /**
   * Vue détaillée du wallet marchand (§11 onglet "Wallet" : solde, frais, règlements).
   * Les frais du mois sont calculés depuis les Transaction.feeAmount des paiements
   * reçus par ce marchand (le ledger ne modélise pas encore un wallet plateforme
   * dédié — voir note dans PaymentEngineService.collectForMerchant).
   */
  async getWalletDetail(merchantId: string) {
    const wallet = await this.getWallet(merchantId);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const feesAgg = await this.prisma.transaction.aggregate({
      where: {
        destWalletId: wallet.id,
        type: 'PAYMENT',
        status: 'SUCCESS',
        createdAt: { gte: startOfMonth },
      },
      _sum: { feeAmount: true },
    });

    const settlements = await this.prisma.settlement.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      cachedBalance: wallet.cachedBalance,
      pendingBalance: wallet.pendingBalance,
      feesThisMonth: feesAgg._sum.feeAmount ?? 0n,
      recentSettlements: settlements,
    };
  }

  /** Marchands auxquels l'utilisateur connecté est rattaché, avec son rôle interne (§32). */
  async listMineForUser(userId: string) {
    const links = await this.prisma.merchantUser.findMany({
      where: { userId },
      include: { merchant: { include: { wallet: true } } },
    });
    return links.map((link) => ({
      merchantId: link.merchantId,
      role: link.role,
      businessName: link.merchant.businessName,
      status: link.merchant.status,
      transfersEnabled: link.merchant.transfersEnabled,
    }));
  }

  /** Agrège les chiffres de l'écran principal du dashboard marchand (§10). */
  async getDashboard(merchantId: string) {
    const wallet = await this.getWallet(merchantId);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [todaySum, monthSum] = await Promise.all([
      this.sumIncomingSince(wallet.id, startOfDay),
      this.sumIncomingSince(wallet.id, startOfMonth),
    ]);

    return {
      availableBalance: wallet.cachedBalance,
      pendingBalance: wallet.pendingBalance,
      todayCollections: todaySum,
      monthCollections: monthSum,
    };
  }

  private async sumIncomingSince(walletId: string, since: Date) {
    const result = await this.prisma.ledgerEntry.aggregate({
      where: { walletId, type: 'CREDIT', createdAt: { gte: since } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0n;
  }

  async getTransactions(merchantId: string, page = 1, pageSize = 20) {
    const wallet = await this.getWallet(merchantId);
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
}
