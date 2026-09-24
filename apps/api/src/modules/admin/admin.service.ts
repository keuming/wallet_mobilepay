import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, MerchantStatus, TransactionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../config/prisma.service';
import { Hub2Adapter } from '../payment-engine/providers/hub2.adapter';
import { ReloadlyAdapter } from '../payment-engine/providers/reloadly.adapter';
import { LedgerService } from '../ledger/ledger.service';
import { normalizePhoneCI } from '../../common/utils/phone.util';

const PAGE_SIZE_DEFAULT = 20;

const MANUAL_FUNDING_SERVICE_LABELS: Record<string, string> = {
  WALLET_RECHARGE: 'Recharge wallet',
  AIRTIME_DATA: "Crédit d'appel et data",
  TRANSFER: "Transfert d'argent",
  CARD_LOAD: 'Rechargement carte virtuelle',
  BULK_PAYMENT: 'Bulk paiement',
  BANK_TRANSFER: 'Virement bancaire',
  OTHER: 'Autre',
};

// Grille tarifaire HUB2 réelle (tableau de frais du compte marchand CSN,
// consultée le 28/08/2026 — à mettre à jour si HUB2 republie de nouveaux
// taux). "payment" = pay-in/collecte, "transfer" = pay-out/décaissement.
// Taux les plus récents retenus quand plusieurs versions coexistent (ex.
// MTN transfer : 1% → 0.5% au 28/07/2026).
const HUB2_PAYIN_RATE_BPS: Record<string, number> = { ORANGE: 200, MOOV: 200, WAVE: 200, MTN: 200 };
const HUB2_PAYOUT_RATE_BPS: Record<string, number> = { ORANGE: 100, MOOV: 100, WAVE: 125, MTN: 50 };
// Marge ORZAYAH — 1% flat, tout opérateur et tout type de transaction,
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
    private ledger: LedgerService,
  ) {}

  /**
   * Liste les transactions QR Lite dont le paiement HUB2 a ete collecte
   * mais dont la livraison Reloadly a echoue — argent du client bloque,
   * remboursement a traiter. Extrait le numero du payeur et l'operateur
   * Mobile Money depuis la reponse HUB2 brute deja enregistree
   * (PaymentAttempt.rawResponse), aucune nouvelle donnee a demander.
   */

  /**
   * Genere un lot de N cartes QR VIERGES (status UNASSIGNED), pretes a
   * imprimer. Format court et lisible (utile si le code doit aussi etre
   * saisi a la main en cas de QR illisible) — distinct des codes QR
   * marchands existants, qui derivent de l'id du marchand deja cree.
   */
  async createQrBatch(quantity: number, label: string, adminUserId: string, idempotencyKey: string) {
    if (quantity < 1 || quantity > 5000) {
      throw new BadRequestException('La quantite doit etre entre 1 et 5000.');
    }
    const existing = await this.prisma.qrBatch.findFirst({ where: { label } });
    if (existing) {
      // § Rejeu detecte via le label (unique par convention cote UI) plutot
      // qu'une vraie colonne idempotencyKey sur QrBatch — evite une
      // migration de schema pour une operation rare et a faible risque
      // financier direct, tout en empechant un doublon de lot physique.
      return this.listQrBatches().then((all) => all.find((b) => b.id === existing.id));
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.qrBatch.create({
        data: { label, quantity, generatedBy: adminUserId },
      });

      const codes = Array.from({ length: quantity }, () => ({
        code: `ORZ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        type: 'MERCHANT_STATIC' as const,
        status: 'UNASSIGNED' as const,
        batchId: batch.id,
      }));

      await tx.qrCode.createMany({ data: codes });

      return { batch, codes: codes.map((c) => c.code) };
    });
  }

  /** Assigne un lot deja genere a un agent commercial nomme. */
  async assignQrBatch(batchId: string, agentId: string) {
    const batch = await this.prisma.qrBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (batch.assignedAgentId) {
      throw new BadRequestException('Ce lot est deja assigne a un agent.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.qrBatch.update({ where: { id: batchId }, data: { assignedAgentId: agentId } });
      await tx.qrCode.updateMany({
        where: { batchId, status: 'UNASSIGNED' },
        data: { status: 'ASSIGNED' },
      });
      return tx.qrBatch.findUniqueOrThrow({ where: { id: batchId }, include: { codes: true } });
    });
  }

  /** Liste des lots, avec compte des cartes liees vs en attente. */
  async listQrBatches() {
    const batches = await this.prisma.qrBatch.findMany({
      include: {
        assignedAgent: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        codes: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return batches.map((b) => ({
      id: b.id,
      label: b.label,
      quantity: b.quantity,
      createdAt: b.createdAt,
      assignedAgent: b.assignedAgent
        ? `${b.assignedAgent.user.firstName} ${b.assignedAgent.user.lastName} (${b.assignedAgent.user.phone})`
        : null,
      linkedCount: b.codes.filter((c) => c.status === 'ACTIVE').length,
      totalCount: b.codes.length,
    }));
  }

  async listPendingRefunds() {
    const stuck = await this.prisma.transaction.findMany({
      where: {
        type: 'AIRTIME',
        status: 'FAILED',
        refundedAt: null,
        failureReason: { contains: 'remboursement', mode: 'insensitive' },
      },
      include: {
        paymentAttempts: { where: { providerName: 'HUB2' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    return stuck.map((tx) => {
      const raw = tx.paymentAttempts[0]?.rawResponse as any;
      const payment = raw?.payments?.[0];
      return {
        id: tx.id,
        amount: tx.amount.toString(),
        feeAmount: tx.feeAmount.toString(),
        totalCollected: (tx.amount + tx.feeAmount).toString(),
        operatorId: tx.operatorId,
        createdAt: tx.createdAt,
        payerPhone: raw?.customerReference ?? payment?.number ?? null,
        payerProvider: payment?.provider ?? null,
        providerRef: tx.providerRef,
      };
    });
  }

  /**
   * Declenche le remboursement effectif : un transfert HUB2 (le meme
   * mecanisme qu'un retrait) vers le numero du payeur d'origine, pour le
   * montant total qu'il avait paye (credit demande + frais ORZAYAH). La
   * transaction d'origine est marquee remboursee une fois le transfert
   * initie avec succes, pour ne plus apparaitre dans la liste.
   */
  async processRefund(transactionId: string) {
    const tx = await this.prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { paymentAttempts: { where: { providerName: 'HUB2' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (tx.refundedAt) {
      throw new BadRequestException('Cette transaction a deja ete remboursee.');
    }

    const raw = tx.paymentAttempts[0]?.rawResponse as any;
    const payment = raw?.payments?.[0];
    const payerPhone = raw?.customerReference ?? payment?.number;
    const payerProvider = payment?.provider;

    if (!payerPhone || !payerProvider) {
      throw new BadRequestException(
        'Numero ou operateur du payeur introuvable dans les donnees de la transaction — remboursement a traiter manuellement.',
      );
    }

    const totalAmount = tx.amount + tx.feeAmount;

    const refund = await this.hub2.initiateWithdrawal({
      walletId: '',
      amount: totalAmount,
      currency: 'XOF',
      customerPhone: payerPhone,
      provider: payerProvider,
      recipientName: 'Remboursement ORZAYAH',
      reference: `REFUND-${tx.id}`,
    });

    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: { refundedAt: new Date(), refundTransactionId: refund.providerRef },
    });

    return { success: true, providerRef: refund.providerRef, amountRefunded: totalAmount.toString() };
  }


  /**
   * KPIs providers (§ dashboard admin) — soldes réels HUB2/Reloadly quand des
   * identifiants sont configurés (sinon `null`, affiché honnêtement côté UI
   * plutôt que de simuler un chiffre) ; consommation Reloadly par opérateur ;
   * et commissions HUB2 pay-in/pay-out + marge ORZAYAH, calculées depuis nos
   * propres volumes de transactions réussies (grille tarifaire HUB2 réelle
   * fournie par l'administrateur, pas une donnée fictive).
   */
  /**
   * Programme de cartes prépayées (§ page Cartes virtuelles admin) — solde
   * par marque (VISA/Mastercard) calculé depuis les demandes de rechargement
   * confirmées (status RECEIVED), et historique complet pour audit.
   */
  async createCardFunding(input: {
    brand?: 'VISA' | 'MASTERCARD';
    source: 'BANK_TRANSFER' | 'PAYPAL' | 'MANUAL';
    amount: number;
    reference?: string;
    details?: Record<string, unknown>;
    requestedByAdminId: string;
  }) {
    return this.prisma.cardFunding.create({
      data: {
        brand: input.brand,
        source: input.source,
        amount: BigInt(input.amount),
        reference: input.reference,
        details: input.details as Prisma.InputJsonValue,
        requestedByAdminId: input.requestedByAdminId,
        status: 'PENDING',
      },
    });
  }

  /** Historique d'un rail de trésorerie indépendant des cartes (§ PayPal, Virement bancaire). */
  async listFundingsBySource(source: 'PAYPAL' | 'BANK_TRANSFER') {
    return this.prisma.cardFunding.findMany({
      where: { source },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Total confirmé pour un rail de trésorerie donné. */
  async getFundingSourceTotal(source: 'PAYPAL' | 'BANK_TRANSFER') {
    const result = await this.prisma.cardFunding.aggregate({
      where: { source, status: 'RECEIVED' },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0n);
  }

  async confirmCardFunding(id: string) {
    const funding = await this.prisma.cardFunding.findUniqueOrThrow({ where: { id } });
    if (funding.status !== 'PENDING') {
      throw new BadRequestException('Cette demande a déjà été traitée.');
    }
    return this.prisma.cardFunding.update({
      where: { id },
      data: { status: 'RECEIVED', confirmedAt: new Date() },
    });
  }

  async listCardFundings() {
    return this.prisma.cardFunding.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getCardProgramBalances() {
    const received = await this.prisma.cardFunding.groupBy({
      by: ['brand'],
      where: { status: 'RECEIVED', brand: { not: null } },
      _sum: { amount: true },
    });
    const balances = { VISA: 0, MASTERCARD: 0 };
    for (const row of received) {
      if (!row.brand) continue; // garde-fou — exclut PayPal/Virement (sans marque)
      balances[row.brand] = Number(row._sum.amount ?? 0n);
    }
    return balances;
  }

  /**
   * Création par un admin (§ boutons "Ajouter" back-office) — chemin
   * additionnel à l'inscription en libre-service depuis les apps wallet
   * (particulier/marchand/agent créent normalement leur propre compte).
   * Mot de passe temporaire à communiquer au titulaire, à changer à la
   * première connexion (non forcé au MVP, TODO amélioration future).
   */
  async createParticulier(dto: { phone: string; firstName: string; lastName: string; password: string }) {
    const existing = await this.prisma.user.findUnique({ where: { phone: normalizePhoneCI(dto.phone) } });
    if (existing) throw new ConflictException('Un compte existe déjà avec ce numéro.');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        phone: normalizePhoneCI(dto.phone),
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: 'PARTICULIER',
        wallet: { create: { type: 'PARTICULIER' } },
      },
    });
  }

  async createAgent(dto: { phone: string; firstName: string; lastName: string; password: string; zone?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { phone: normalizePhoneCI(dto.phone) } });
    if (existing) throw new ConflictException('Un compte existe déjà avec ce numéro.');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: normalizePhoneCI(dto.phone),
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          role: 'AGENT',
        },
      });
      const agent = await tx.agent.create({ data: { userId: user.id, zone: dto.zone } });
      return { user, agent };
    });
  }

  /**
   * Création d'un marchand par un admin — mirroir de MerchantsService.create()
   * (self-service) mais crée aussi le compte titulaire s'il n'existe pas déjà,
   * puisqu'un admin n'a pas de JWT "propriétaire" à rattacher.
   */
  async createMerchant(dto: {
    businessName: string;
    category: string;
    ownerPhone: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerPin?: string;
    country?: string;
    feeRateBps?: number;
  }) {
    let owner = await this.prisma.user.findUnique({ where: { phone: normalizePhoneCI(dto.ownerPhone, (dto.country as any) ?? 'CI') } });
    const ownerExistedAlready = !!owner; // capturé AVANT toute réaffectation ci-dessous
    if (!ownerExistedAlready && !dto.ownerPin) {
      throw new BadRequestException('Un code PIN est requis pour créer le compte du titulaire.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (!owner) {
        const passwordHash = await bcrypt.hash(dto.ownerPin!, 12);
        owner = await tx.user.create({
          data: {
            phone: normalizePhoneCI(dto.ownerPhone, (dto.country as any) ?? 'CI'),
            firstName: dto.ownerFirstName,
            lastName: dto.ownerLastName,
            country: dto.country ?? 'CI',
            passwordHash,
            role: 'MERCHANT_USER',
          },
        });
      }

      const merchant = await tx.merchant.create({
        data: {
          businessName: dto.businessName,
          category: dto.category,
          status: 'PENDING',
          country: dto.country ?? 'CI',
          feeRateBps: dto.feeRateBps ?? 200,
        },
      });

      await tx.wallet.create({ data: { type: 'MERCHANT', merchantId: merchant.id, currency: 'XOF' } });
      await tx.merchantUser.create({ data: { merchantId: merchant.id, userId: owner!.id, role: 'MERCHANT_ADMIN' } });
      await tx.qrCode.create({
        data: {
          code: `MPM${merchant.id.slice(0, 10).toUpperCase()}`,
          type: 'MERCHANT_STATIC',
          status: 'UNASSIGNED',
          merchantId: merchant.id,
        },
      });

      return {
        merchant,
        ownerCreated: !ownerExistedAlready,
      };
    });
  }

  /**
   * § Approvisionnement manuel — un client dépose de l'argent hors
   * plateforme (espèces, virement, chèque) et envoie une preuve ; un
   * comptable enregistre ici le crédit correspondant sur le wallet
   * particulier ou marchand, avec le justificatif joint.
   */
  async recordManualFunding(
    dto: {
      targetType: 'PARTICULIER' | 'MERCHANT';
      targetUserId?: string;
      targetMerchantId?: string;
      amount: number;
      serviceType: string;
      note?: string;
    },
    proof: { fileName: string; mimeType: string; data: string },
    recordedByUserId: string,
  ) {
    if (dto.targetType === 'PARTICULIER' && !dto.targetUserId) {
      throw new BadRequestException('Compte particulier requis.');
    }
    if (dto.targetType === 'MERCHANT' && !dto.targetMerchantId) {
      throw new BadRequestException('Compte marchand requis.');
    }

    const wallet =
      dto.targetType === 'PARTICULIER'
        ? await this.prisma.wallet.findUniqueOrThrow({ where: { userId: dto.targetUserId } })
        : await this.prisma.wallet.findUniqueOrThrow({ where: { merchantId: dto.targetMerchantId } });

    const amount = BigInt(dto.amount);
    const serviceLabel = MANUAL_FUNDING_SERVICE_LABELS[dto.serviceType] ?? dto.serviceType;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: 'TOPUP',
          status: 'SUCCESS',
          amount,
          feeAmount: 0n,
          destWalletId: wallet.id,
          initiatedByUserId: recordedByUserId,
          description: `Approvisionnement manuel — ${serviceLabel}${dto.note ? ` (${dto.note})` : ''}`,
          providerName: 'MANUAL',
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: wallet.id,
        amount,
        description: `Approvisionnement manuel — ${serviceLabel}`,
      });

      await tx.manualFunding.create({
        data: {
          targetType: dto.targetType,
          targetUserId: dto.targetUserId,
          targetMerchantId: dto.targetMerchantId,
          amount,
          serviceType: dto.serviceType,
          note: dto.note,
          proofFileName: proof.fileName,
          proofMimeType: proof.mimeType,
          proofData: proof.data,
          transactionId: transaction.id,
          recordedByUserId,
        },
      });

      return { transaction, message: 'Approvisionnement enregistré avec succès.' };
    });
  }

  /** Historique des approvisionnements manuels (§ back-office admin). */
  async listManualFundings(page = 1) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.manualFunding.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE_DEFAULT,
        take: PAGE_SIZE_DEFAULT,
        select: {
          id: true,
          targetType: true,
          targetUserId: true,
          targetMerchantId: true,
          amount: true,
          serviceType: true,
          note: true,
          proofFileName: true,
          proofMimeType: true,
          createdAt: true,
        },
      }),
      this.prisma.manualFunding.count(),
    ]);

    const userIds = items.filter((i) => i.targetUserId).map((i) => i.targetUserId!);
    const merchantIds = items.filter((i) => i.targetMerchantId).map((i) => i.targetMerchantId!);
    const [users, merchants] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
        : [],
      merchantIds.length
        ? this.prisma.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, businessName: true } })
        : [],
    ]);
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const merchantMap = new Map(merchants.map((m) => [m.id, m.businessName]));

    const enriched = items.map((i) => ({
      ...i,
      accountLabel: i.targetUserId ? (userMap.get(i.targetUserId) ?? '—') : (merchantMap.get(i.targetMerchantId!) ?? '—'),
    }));

    return { items: enriched, total, page, pageSize: PAGE_SIZE_DEFAULT };
  }

  /** Récupère la preuve d'un approvisionnement (§ affichage/téléchargement admin). */
  async getManualFundingProof(id: string) {
    const record = await this.prisma.manualFunding.findUniqueOrThrow({
      where: { id },
      select: { proofFileName: true, proofMimeType: true, proofData: true },
    });
    return record;
  }

  async updateUser(id: string, dto: { firstName?: string; lastName?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: { firstName: dto.firstName, lastName: dto.lastName },
    });
  }

  /** Réinitialise le mot de passe (§ compte perdu — pas encore de flux SMS self-service). */
  async resetUserPassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  /**
   * Définit ou réinitialise le code secret de transaction d'un utilisateur
   * (§ back-office — couvre à la fois particulier et marchand, puisqu'un
   * marchand est en réalité un User comme un autre, lié via MerchantUser).
   * Fonctionne que le compte ait déjà un code (réinitialisation) ou non
   * (initialisation) — même opération technique dans les deux cas.
   */
  async setUserPin(id: string, newPin: string) {
    if (!/^\d{4,6}$/.test(newPin)) {
      throw new BadRequestException('Le code secret doit contenir entre 4 et 6 chiffres.');
    }
    const transactionPinHash = await bcrypt.hash(newPin, 12);
    await this.prisma.user.update({
      where: { id },
      data: { transactionPinHash, securityFailedAttempts: 0, securityLockedUntil: null },
    });
    return { message: 'Code secret défini avec succès.' };
  }

  /** Change le numéro de téléphone d'un utilisateur — vérifie qu'aucun autre compte ne l'utilise déjà. */
  async updateUserPhone(id: string, newPhoneRaw: string) {
    const newPhone = normalizePhoneCI(newPhoneRaw);
    const existing = await this.prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== id) {
      throw new ConflictException('Ce numéro est déjà utilisé par un autre compte.');
    }
    await this.prisma.user.update({ where: { id }, data: { phone: newPhone } });
    return { message: 'Numéro de téléphone mis à jour avec succès.' };
  }

  async updateMerchant(id: string, dto: { businessName?: string; category?: string; feeRateBps?: number }) {
    return this.prisma.merchant.update({
      where: { id },
      data: { businessName: dto.businessName, category: dto.category, feeRateBps: dto.feeRateBps },
    });
  }

  /**
   * Services B2B "Collecte" et "Bulk Payment" (§ menu admin) — un client est
   * un marchand existant inscrit à l'un de ces services. L'historique affiché
   * réutilise directement les transactions réelles de son wallet marchand.
   */
  async listEnterpriseClients(serviceType: 'COLLECTE' | 'BULK_PAYMENT') {
    return this.prisma.enterpriseServiceClient.findMany({
      where: { serviceType },
      include: {
        merchant: { select: { id: true, businessName: true, category: true, status: true, wallet: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addEnterpriseClient(serviceType: 'COLLECTE' | 'BULK_PAYMENT', merchantId: string, notes?: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Marchand introuvable.');

    const existing = await this.prisma.enterpriseServiceClient.findUnique({
      where: { serviceType_merchantId: { serviceType, merchantId } },
    });
    if (existing) throw new ConflictException('Ce marchand est déjà client de ce service.');

    return this.prisma.enterpriseServiceClient.create({
      data: { serviceType, merchantId, notes },
      include: { merchant: { select: { businessName: true } } },
    });
  }

  async removeEnterpriseClient(id: string) {
    await this.prisma.enterpriseServiceClient.findUniqueOrThrow({ where: { id } });
    return this.prisma.enterpriseServiceClient.delete({ where: { id } });
  }

  /** Historique de transactions du wallet marchand d'un client de service. */
  async getEnterpriseClientTransactions(id: string) {
    const client = await this.prisma.enterpriseServiceClient.findUniqueOrThrow({
      where: { id },
      include: { merchant: { include: { wallet: true } } },
    });
    if (!client.merchant.wallet) return [];

    return this.prisma.ledgerEntry.findMany({
      where: { walletId: client.merchant.wallet.id },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getProviderKpis() {
    const hub2DefaultPayout = Number(this.config.get('HUB2_PAYOUT_DEFAULT_BALANCE_CENTS', '0'));
    const reloadlyDefaultBalance = Number(this.config.get('RELOADLY_DEFAULT_BALANCE_CENTS', '0'));

    const [hub2Balances, reloadlyBalance, consumptionRows, topupRows, withdrawalRows] = await Promise.all([
      this.hub2.getBalance().catch((err) => {
        console.error('[AdminService] HUB2 getBalance a échoué :', err?.message ?? err);
        return null;
      }),
      this.reloadly.getBalance().catch((err) => {
        console.error('[AdminService] Reloadly getBalance a échoué :', err?.message ?? err);
        return null;
      }),
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
    // HUB2 réel par opérateur, + marge ORZAYAH 1% sur le même volume.
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

    // Reloadly n'expose pas de commission séparée — la marge ORZAYAH 1% sur
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

  /** Autorise ou révoque le droit pour un marchand de transférer de l'argent
   * depuis son wallet (§ dashboard marchand — nouveau parcours Transfert). */
  async setMerchantTransfersEnabled(id: string, enabled: boolean) {
    await this.prisma.merchant.findUniqueOrThrow({ where: { id } });
    return this.prisma.merchant.update({ where: { id }, data: { transfersEnabled: enabled } });
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
      ...(params.reference
        ? {
            OR: [
              { reference: { contains: params.reference, mode: 'insensitive' } },
              { id: { contains: params.reference, mode: 'insensitive' } },
              { providerRef: { contains: params.reference, mode: 'insensitive' } },
            ],
          }
        : {}),
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

  /**
   * Détail complet d'une transaction (§ utile en cas de litige) — numéro du
   * payeur (wallet ORZAYAH ou Mobile Money externe selon le circuit),
   * marchand destinataire, toutes les tentatives de paiement associées.
   */
  async getTransactionDetail(id: string) {
    const tx = await this.prisma.transaction.findUniqueOrThrow({
      where: { id },
      include: { paymentAttempts: { orderBy: { createdAt: 'asc' } } },
    });

    const [initiatedByUser, sourceWallet, destWallet] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: tx.initiatedByUserId },
        select: { phone: true, firstName: true, lastName: true },
      }),
      tx.sourceWalletId
        ? this.prisma.wallet.findUnique({
            where: { id: tx.sourceWalletId },
            include: {
              user: { select: { phone: true, firstName: true, lastName: true } },
              merchant: { select: { businessName: true } },
            },
          })
        : null,
      tx.destWalletId
        ? this.prisma.wallet.findUnique({
            where: { id: tx.destWalletId },
            include: {
              user: { select: { phone: true, firstName: true, lastName: true } },
              merchant: { select: { businessName: true } },
            },
          })
        : null,
    ]);

    // Pour un paiement Mobile Money externe (HUB2, sans wallet source — le
    // client n'a pas forcément de compte ORZAYAH), le vrai numéro payeur
    // se trouve dans la tentative de paiement, pas sur un wallet.
    const lastAttempt = tx.paymentAttempts[tx.paymentAttempts.length - 1];
    const externalPayerPhone =
      (lastAttempt?.rawResponse as any)?.payments?.[0]?.number ??
      (lastAttempt?.rawResponse as any)?.customerReference ??
      null;

    return {
      ...tx,
      initiatedByUser,
      sourceWallet,
      destWallet,
      externalPayerPhone,
    };
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

  // ---------------------------------------------------------------------
  // § Administration de l'équipe back-office (permissions granulaires)
  // ---------------------------------------------------------------------

  async listAdminTeam() {
    return this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        isSuperAdmin: true,
        adminPermissions: true,
        isBlocked: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAdminUser(dto: {
    phone: string;
    firstName: string;
    lastName: string;
    password: string;
    permissions?: string[];
  }) {
    const phone = normalizePhoneCI(dto.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone } });

    // § Un compte existant n'est pas forcément une erreur : il est fréquent
    // qu'un collaborateur ait DÉJÀ un compte particulier ORZAYAH avant
    // qu'on lui donne accès au back-office. Refuser purement et simplement
    // obligeait à créer un second compte avec un autre numéro, ce qui n'a
    // pas de sens. On promeut donc le compte existant, sauf s'il est déjà
    // administrateur (là, c'est bien un doublon réel).
    if (existing) {
      if (existing.role === 'ADMIN') {
        throw new ConflictException(
          'Ce numéro est déjà un compte back-office. Modifiez plutôt ses permissions dans la liste.',
        );
      }
      // § Corrigé : le mot de passe saisi dans le formulaire était IGNORÉ
      // lors d'une promotion — le compte gardait son ancien mot de passe
      // (souvent inconnu de l'admin qui vient de le créer), d'où un
      // "identifiants invalides" à la première connexion. On applique
      // désormais bien le mot de passe fourni, et on remet à zéro tout
      // verrouillage anti-force-brute hérité du compte précédent.
      const promotedPasswordHash = await bcrypt.hash(dto.password, 12);
      const promoted = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          adminPermissions: dto.permissions ?? [],
          passwordHash: promotedPasswordHash,
          // Le nom saisi dans le formulaire fait foi — l'admin le renseigne
          // volontairement, il doit primer sur celui du compte existant.
          firstName: dto.firstName,
          lastName: dto.lastName,
          securityFailedAttempts: 0,
          securityLockedUntil: null,
        },
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
          adminPermissions: true,
          createdAt: true,
        },
      });
      return promoted;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: 'ADMIN',
        adminPermissions: dto.permissions ?? [],
        // Un compte créé depuis l'interface n'est JAMAIS super-admin : ce
        // statut ne s'accorde qu'en base, volontairement, pour éviter
        // qu'une erreur d'interface ne donne les pleins pouvoirs.
        isSuperAdmin: false,
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        adminPermissions: true,
        createdAt: true,
      },
    });
    return user;
  }

  async updateAdminPermissions(targetUserId: string, permissions: string[], actingUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Compte introuvable.');
    if (target.role !== 'ADMIN') {
      throw new BadRequestException("Ce compte n'est pas un compte back-office.");
    }
    // Un super-admin ne peut pas être restreint depuis l'interface — sinon
    // une erreur (ou un acte malveillant) pourrait verrouiller définitivement
    // l'accès complet au back-office.
    if (target.isSuperAdmin) {
      throw new ForbiddenException(
        "Les permissions d'un super-administrateur ne se modifient pas depuis l'interface.",
      );
    }
    if (targetUserId === actingUserId) {
      throw new BadRequestException('Vous ne pouvez pas modifier vos propres permissions.');
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { adminPermissions: permissions },
      select: { id: true, adminPermissions: true },
    });
  }

  async revokeAdminAccess(targetUserId: string, actingUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Compte introuvable.');
    if (target.isSuperAdmin) {
      throw new ForbiddenException("L'accès d'un super-administrateur ne peut pas être révoqué ici.");
    }
    if (targetUserId === actingUserId) {
      throw new BadRequestException('Vous ne pouvez pas révoquer votre propre accès.');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: 'PARTICULIER', adminPermissions: [] },
    });
    return { message: 'Accès back-office révoqué.' };
  }
}
