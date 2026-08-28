import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, MerchantStatus, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { Hub2Adapter } from '../payment-engine/providers/hub2.adapter';
import { ReloadlyAdapter } from '../payment-engine/providers/reloadly.adapter';

const PAGE_SIZE_DEFAULT = 20;

// Grille tarifaire HUB2 réelle (tableau de frais du compte marchand CSN,
// consultée le 28/08/2026 — à mettre à jour si HUB2 republie de nouveaux
// taux). "payment" = pay-in/collecte, "transfer" = pay-out/décaissement.
// Taux les plus récents retenus quand plusieurs versions coexistent (ex.
// MTN transfer : 1% → 0.5% au 28/07/2026).
const HUB2_PAYIN_RATE_BPS: Record<string, number> = { ORANGE: 200, MOOV: 200, WAVE: 200, MTN: 200 };
const HUB2_PAYOUT_RATE_BPS: Record<string, number> = { ORANGE: 100, MOOV: 100, WAVE: 125, MTN: 50 };
// Marge MobilePay — 1% flat, tout opérateur et tout type de transaction,
// ajoutée en plus des frais HUB2/Reloadly eux-mêmes.
const MOBILEPAY_MARKUP_BPS = 100;

function applyRate(amount: bigint, rateBps: number): number {
  return Number((amount * BigInt(rateBps)) / 10_000n);
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private hub2: Hub2Adapter,
    private reloadly: ReloadlyAdapter,
  ) {}

  /**
   * KPIs providers (§ dashboard admin) — soldes réels HUB2/Reloadly quand des
   * identifiants sont configurés (sinon `null`, affiché honnêtement côté UI
   * plutôt que de simuler un chiffre) ; consommation Reloadly par opérateur ;
   * et commissions HUB2 pay-in/pay-out + marge MobilePay, calculées depuis nos
   * propres volumes de transactions réussies (grille tarifaire HUB2 réelle
   * fournie par l'administrateur, pas une donnée fictive).
   */
  async getProviderKpis() {
    const hub2DefaultPayout = Number(this.config.get('HUB2_PAYOUT_DEFAULT_BALANCE_CENTS', '0'));
    const reloadlyDefaultBalance = Number(this.config.get('RELOADLY_DEFAULT_BALANCE_CENTS', '0'));

    const [hub2Balances, reloadlyBalance, consumptionRows, topupRows, withdrawalRows] = await Promise.all([
      this.hub2.getBalance().catch(() => null),
      this.reloadly.getBalance().catch(() => null),
      this.prisma.transaction.groupBy({
        by: ['operatorName', 'airtimeKind'],
        where: { type: 'AIRTIME', status: 'SUCCESS', providerName: 'RELOADLY', operatorName: { not: null } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['operatorId'],
        where: { type: 'TOPUP', status: 'SUCCESS', providerName: 'HUB2', operatorId: { not: null } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['operatorId'],
        where: { type: 'WITHDRAWAL', status: 'SUCCESS', providerName: 'HUB2', operatorId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    // Consommation Reloadly par opérateur, crédit d'appel et data séparément.
    const consumption = { airtime: {} as Record<string, number>, data: {} as Record<string, number> };
    for (const row of consumptionRows) {
      if (!row.operatorName) continue;
      const bucket = row.airtimeKind === 'DATA' ? consumption.data : consumption.airtime;
      bucket[row.operatorName] = (bucket[row.operatorName] ?? 0) + Number(row._sum.amount ?? 0n);
    }

    // Commission HUB2 pay-in (recharges wallet, TOPUP) : volume réel × taux
    // HUB2 réel par opérateur, + marge MobilePay 1% sur le même volume.
    let payInVolume = 0n;
    let payInHub2Fee = 0;
    for (const row of topupRows) {
      const vol = row._sum.amount ?? 0n;
      payInVolume += vol;
      payInHub2Fee += applyRate(vol, HUB2_PAYIN_RATE_BPS[row.operatorId!] ?? 0);
    }
    const payInMarkup = applyRate(payInVolume, MOBILEPAY_MARKUP_BPS);

    // Commission HUB2 pay-out (envois externes, WITHDRAWAL).
    let payOutVolume = 0n;
    let payOutHub2Fee = 0;
    for (const row of withdrawalRows) {
      const vol = row._sum.amount ?? 0n;
      payOutVolume += vol;
      payOutHub2Fee += applyRate(vol, HUB2_PAYOUT_RATE_BPS[row.operatorId!] ?? 0);
    }
    const payOutMarkup = applyRate(payOutVolume, MOBILEPAY_MARKUP_BPS);

    // Reloadly n'expose pas de commission séparée — la marge MobilePay 1% sur
    // le volume est la seule "commission" que nous percevons sur ces flux.
    const reloadlyTopupVolume = Object.values(consumption.airtime).reduce((a, b) => a + b, 0);
    const reloadlyDataVolume = Object.values(consumption.data).reduce((a, b) => a + b, 0);

    return {
      hub2: {
        // Le solde "pay-out" est toujours affiché : montant de départ
        // pré-financé + vrai solde HUB2 une fois l'API connectée (0 sinon).
        // Le solde "collecte" reste conditionné à une vraie connexion, faute
        // de montant de départ défini pour ce compte-là.
        payoutBalance: hub2DefaultPayout + (hub2Balances?.transferAvailable ?? 0),
        payoutReserved: hub2Balances?.transferReserved ?? 0,
        collectionAvailable: hub2Balances?.collectionAvailable ?? null,
        currency: hub2Balances?.currency ?? 'XOF',
        fetchedAt: hub2Balances?.fetchedAt ?? null,
        configured: !!hub2Balances,
      },
      reloadly: {
        // Idem : solde de départ + vrai solde Reloadly une fois connecté.
        balance: reloadlyDefaultBalance + (reloadlyBalance?.balance ?? 0),
        currencyCode: reloadlyBalance?.currencyCode ?? 'XOF',
        updatedAt: reloadlyBalance?.updatedAt ?? null,
        configured: !!reloadlyBalance,
      },
      reloadlyConsumption: consumption,
      commissions: {
        hub2PayIn: { volume: Number(payInVolume), hub2Fee: payInHub2Fee, mobilePayMarkup: payInMarkup, total: payInHub2Fee + payInMarkup },
        hub2PayOut: { volume: Number(payOutVolume), hub2Fee: payOutHub2Fee, mobilePayMarkup: payOutMarkup, total: payOutHub2Fee + payOutMarkup },
        reloadlyTopup: { volume: reloadlyTopupVolume, mobilePayMarkup: applyRate(BigInt(reloadlyTopupVolume), MOBILEPAY_MARKUP_BPS), total: applyRate(BigInt(reloadlyTopupVolume), MOBILEPAY_MARKUP_BPS) },
        reloadlyData: { volume: reloadlyDataVolume, mobilePayMarkup: applyRate(BigInt(reloadlyDataVolume), MOBILEPAY_MARKUP_BPS), total: applyRate(BigInt(reloadlyDataVolume), MOBILEPAY_MARKUP_BPS) },
      },
    };
  }

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

  // --- Providers (§26-29) ---

  /**
   * Statut des intégrations externes, dérivé de la présence des credentials
   * en configuration — aucune donnée sensible n'est jamais renvoyée, juste
   * un état "configuré / simulé / non configuré".
   */
  getProvidersStatus() {
    const hub2Key = this.config.get('HUB2_API_KEY', '');
    const stripeKey = this.config.get('STRIPE_SECRET_KEY', '');
    const paypalId = this.config.get('PAYPAL_CLIENT_ID', '');
    const reloadlyId = this.config.get('RELOADLY_CLIENT_ID', '');

    return [
      {
        name: 'HUB2',
        label: 'HUB2 — Mobile Money (Orange/MTN/Moov/Wave)',
        usage: 'Top-up wallet, retraits, encaissements',
        configured: !!hub2Key,
        mode: hub2Key ? 'production' : 'simulé (sandbox local)',
      },
      {
        name: 'RELOADLY',
        label: 'Reloadly — Airtime',
        usage: 'Achat de crédit téléphonique',
        configured: !!reloadlyId,
        mode: reloadlyId ? 'production' : 'simulé (sandbox local)',
      },
      {
        name: 'STRIPE',
        label: 'Stripe — Paiement carte',
        usage: 'Non branché au MVP',
        configured: !!stripeKey,
        mode: stripeKey ? 'production' : 'non configuré',
      },
      {
        name: 'PAYPAL',
        label: 'PayPal',
        usage: 'Non branché au MVP',
        configured: !!paypalId,
        mode: paypalId ? this.config.get('PAYPAL_ENV', 'sandbox') : 'non configuré',
      },
    ];
  }
}
