import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MerchantStatus, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

const PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  /**
   * Chiffres du dashboard admin (§17) — mêmes libellés que la maquette du
   * cahier des charges : utilisateurs, marchands, marchands actifs, agents,
   * transactions/volume du jour, taux d'échec, QR activés.
   */
  async getDashboardStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      usersCount,
      merchantsCount,
      activeMerchantsCount,
      agentsCount,
      qrActivatedCount,
      txToday,
      txTodayFailed,
      volumeTodayAgg,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PARTICULIER' } }),
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.agent.count(),
      this.prisma.qrCode.count({ where: { status: 'ACTIVE' } }),
      this.prisma.transaction.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.transaction.count({
        where: { createdAt: { gte: startOfDay }, status: 'FAILED' },
      }),
      this.prisma.transaction.aggregate({
        where: { createdAt: { gte: startOfDay }, status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    const failureRate = txToday > 0 ? Math.round((txTodayFailed / txToday) * 1000) / 10 : 0;

    return {
      usersCount,
      merchantsCount,
      activeMerchantsCount,
      agentsCount,
      transactionsToday: txToday,
      volumeToday: volumeTodayAgg._sum.amount ?? 0n,
      failureRatePercent: failureRate,
      qrActivatedCount,
    };
  }

  // --- Particuliers (§18) ---

  async listUsers(page = 1, search?: string) {
    const where: Prisma.UserWhereInput = {
      role: 'PARTICULIER',
      ...(search
        ? {
            OR: [
              { phone: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
          kycLevel: true,
          isBlocked: true,
          createdAt: true,
          wallet: { select: { cachedBalance: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE_DEFAULT,
        take: PAGE_SIZE_DEFAULT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, pageSize: PAGE_SIZE_DEFAULT };
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const recentTransactions = user.wallet
      ? await this.prisma.ledgerEntry.findMany({
          where: { walletId: user.wallet.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { transaction: true },
        })
      : [];

    return { ...user, recentTransactions };
  }

  async setUserBlocked(id: string, blocked: boolean) {
    await this.prisma.user.findUniqueOrThrow({ where: { id } });
    return this.prisma.user.update({ where: { id }, data: { isBlocked: blocked } });
  }

  // --- Marchands (§19) ---

  async listMerchants(page = 1, search?: string, status?: MerchantStatus) {
    const where: Prisma.MerchantWhereInput = {
      ...(status ? { status } : {}),
      ...(search ? { businessName: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [merchants, total] = await this.prisma.$transaction([
      this.prisma.merchant.findMany({
        where,
        include: { wallet: { select: { cachedBalance: true, pendingBalance: true } }, agent: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE_DEFAULT,
        take: PAGE_SIZE_DEFAULT,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return { merchants, total, page, pageSize: PAGE_SIZE_DEFAULT };
  }

  async getMerchantDetail(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        wallet: true,
        agent: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        users: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        qrCodes: true,
        kycDossiers: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!merchant) throw new NotFoundException('Marchand introuvable.');
    return merchant;
  }

  async setMerchantStatus(id: string, status: MerchantStatus) {
    await this.prisma.merchant.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.update({ where: { id }, data: { status } });
      // Le QR statique suit le statut du marchand — jamais actif si le marchand
      // est suspendu (§13, §19).
      await tx.qrCode.updateMany({
        where: { merchantId: id, type: 'MERCHANT_STATIC' },
        data: { status: status === 'ACTIVE' ? 'ACTIVE' : 'BLOCKED' },
      });
      return merchant;
    });
  }

  // --- Agents (§20) ---

  async listAgents(page = 1) {
    const [agents, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        include: {
          user: { select: { firstName: true, lastName: true, phone: true } },
          _count: { select: { merchants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE_DEFAULT,
        take: PAGE_SIZE_DEFAULT,
      }),
      this.prisma.agent.count(),
    ]);
    return { agents, total, page, pageSize: PAGE_SIZE_DEFAULT };
  }

  async setAgentStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.prisma.agent.findUniqueOrThrow({ where: { id } });
    return this.prisma.agent.update({ where: { id }, data: { status } });
  }

  // --- Transactions (§22) ---

  async listTransactions(params: {
    page?: number;
    reference?: string;
    status?: TransactionStatus;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = params.page ?? 1;
    const where: Prisma.TransactionWhereInput = {
      ...(params.reference ? { reference: { contains: params.reference, mode: 'insensitive' } } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type as any } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            createdAt: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE_DEFAULT,
        take: PAGE_SIZE_DEFAULT,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { transactions, total, page, pageSize: PAGE_SIZE_DEFAULT };
  }

  // --- QR (§21) ---

  async listQrCodes(page = 1, status?: string) {
    const where: Prisma.QrCodeWhereInput = status ? { status: status as any } : {};
    const [codes, total] = await this.prisma.$transaction([
      this.prisma.qrCode.findMany({
        where,
        include: { merchant: { select: { businessName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE_DEFAULT,
        take: PAGE_SIZE_DEFAULT,
      }),
      this.prisma.qrCode.count({ where }),
    ]);
    return { codes, total, page, pageSize: PAGE_SIZE_DEFAULT };
  }

  async setQrBlocked(code: string, blocked: boolean) {
    const qr = await this.prisma.qrCode.findUnique({ where: { code } });
    if (!qr) throw new NotFoundException('QR introuvable.');
    if (blocked && qr.status === 'BLOCKED') return qr;

    return this.prisma.qrCode.update({
      where: { code },
      data: { status: blocked ? 'BLOCKED' : 'ACTIVE' },
    });
  }
}
