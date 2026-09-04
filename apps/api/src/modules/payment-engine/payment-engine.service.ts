import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { Hub2Adapter } from './providers/hub2.adapter';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { ReloadlyGiftCardsAdapter } from './providers/reloadly-giftcards.adapter';
import { ReloadlyUtilitiesAdapter, BillerType } from './providers/reloadly-utilities.adapter';
import { PricingService } from '../pricing/pricing.service';
import { SmsAdapter } from '../sms/sms.adapter';
import { normalizePhoneCI } from '../../common/utils/phone.util';

const MAX_SERIALIZATION_RETRIES = 3;

const OPERATOR_LABELS: Record<string, string> = {
  ORANGE: 'Orange Money',
  MOOV: 'Moov Money',
  WAVE: 'Wave',
  MTN: 'MTN Money',
};

@Injectable()
export class PaymentEngineService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private hub2: Hub2Adapter,
    private reloadly: ReloadlyAdapter,
    private reloadlyGiftCards: ReloadlyGiftCardsAdapter,
    private reloadlyUtilities: ReloadlyUtilitiesAdapter,
    private pricingService: PricingService,
    private sms: SmsAdapter,
  ) {}

  /**
   * Vérifie le code secret transactionnel de l'utilisateur — utilisé par tout
   * parcours qui déplace de l'argent hors du wallet (Envoyer vers l'externe,
   * et à terme les autres parcours repensés). Duplique volontairement la même
   * logique que AuthService.verifyPin() plutôt que d'importer AuthModule ici,
   * pour éviter toute dépendance circulaire entre modules.
   */
  private async verifyTransactionPin(userId: string, pin: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.transactionPinHash) {
      throw new BadRequestException(
        'Vous devez créer un code secret avant d\'envoyer de l\'argent (menu → Modifier mon code secret).',
      );
    }
    const valid = await bcrypt.compare(pin, user.transactionPinHash);
    if (!valid) throw new UnauthorizedException('Code secret incorrect.');
  }

  /**
   * Envoi vers une destination externe (Mobile Money d'un autre opérateur) —
   * volet "décaissement" du parcours Envoyer repensé. Débite immédiatement le
   * wallet de l'expéditeur, puis délègue le versement réel à HUB2. Remboursé
   * automatiquement si HUB2 échoue après débit.
   */
  async sendToExternalAccount(
    userId: string,
    params: { operator: 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN'; accountNumber: string; amount: bigint; pin: string; recipientName?: string; country?: string },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    await this.verifyTransactionPin(userId, params.pin);
    const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const label = OPERATOR_LABELS[params.operator];

    const transaction = await this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      const created = await tx.transaction.create({
        data: {
          type: 'WITHDRAWAL',
          status: 'PROCESSING',
          amount: params.amount,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Envoi vers ${label} — ${params.accountNumber}`,
          providerName: 'HUB2',
          idempotencyKey,
          operatorId: params.operator,
          operatorName: label,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: created.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount: params.amount,
        description: `Envoi vers ${label} — ${params.accountNumber}`,
      });

      return created;
    });

    const resolvedCountry = params.country ?? sender.country;
    const result = await this.hub2.initiateWithdrawal({
      walletId: '',
      amount: params.amount,
      currency: 'XOF',
      customerPhone: normalizePhoneCI(params.accountNumber, resolvedCountry as any),
      provider: params.operator.toLowerCase(),
      // § Le formulaire "Envoyer" ne collecte pas encore le nom du
      // bénéficiaire — à ajouter à terme. Repli générique en attendant.
      recipientName: params.recipientName ?? 'Bénéficiaire',
      reference: transaction.id,
      country: resolvedCountry,
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerRef: result.providerRef },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'HUB2',
        status: 'PROCESSING',
        providerRef: result.providerRef,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    return { ...transaction, providerRef: result.providerRef };
  }

  /**
   * Finalise un envoi externe depuis le webhook HUB2. Remboursement automatique
   * en cas d'échec — jamais de débit sans versement effectif au destinataire.
   */
  async completeWithdrawal(transactionId: string, success: boolean, failureReason?: string) {
    return this.runSerializable(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Transaction introuvable.');
      if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED') {
        return transaction; // déjà traité — idempotence webhook
      }

      await this.updateLatestPaymentAttemptStatus(tx, transactionId, success ? 'SUCCESS' : 'FAILED');

      if (success) {
        return tx.transaction.update({ where: { id: transactionId }, data: { status: 'SUCCESS' } });
      }

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: transaction.sourceWalletId!,
        amount: transaction.amount,
        description: 'Remboursement — échec envoi externe',
      });

      return tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'FAILED', failureReason },
      });
    });
  }

  /**
   * Encaissement marchand (§12, §25) : débite le wallet du payeur (particulier),
   * crédite le wallet marchand net des frais MobilePay. Utilisé par QR statique,
   * QR dynamique, Payment Link et demande de paiement — tous convergent ici.
   */
  async collectForMerchant(params: {
    payerUserId: string;
    merchantId: string;
    amount: bigint;
    description: string;
    idempotencyKey: string;
    pin: string;
  }) {
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    await this.verifyTransactionPin(params.payerUserId, params.pin);

    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: params.merchantId },
    });

    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException('Ce marchand n\'est pas actif et ne peut pas encaisser.');
    }

    const merchantFee = this.ledger.computeFee(params.amount, merchant.feeRateBps);
    const netAmount = params.amount - merchantFee;
    const ourFee = await this.pricingService.computeOurFee(params.amount);

    return this.runSerializable(async (tx) => {
      const payerWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: params.payerUserId },
      });
      const merchantWallet = await tx.wallet.findUniqueOrThrow({
        where: { merchantId: params.merchantId },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'PAYMENT',
          status: 'SUCCESS',
          amount: params.amount,
          feeAmount: merchantFee + ourFee,
          sourceWalletId: payerWallet.id,
          destWalletId: merchantWallet.id,
          initiatedByUserId: params.payerUserId,
          description: params.description,
          idempotencyKey: params.idempotencyKey,
        },
      });

      // Le payeur est débité du montant plein ; le marchand reçoit le net ;
      // la différence (feeAmount) reste "non affectée" au ledger marchand —
      // en production elle serait créditée à un wallet plateforme dédié.
      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: payerWallet.id,
        toWalletId: merchantWallet.id,
        amount: netAmount,
        description: params.description,
      });

      // Le débit du payeur doit couvrir le montant plein (frais inclus) :
      // on complète par un débit supplémentaire du delta de frais, sans contrepartie
      // wallet (elle ira vers le wallet plateforme une fois celui-ci modélisé).
      if (merchantFee > 0n) {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: payerWallet.id,
          toWalletId: null,
          amount: merchantFee,
          description: 'Frais MobilePay',
        });
      }

      // § Nos frais internes (§ tarification particulier) — s'ajoutent au
      // débit du payeur, distincts de la commission marchand ci-dessus.
      if (ourFee > 0n) {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: payerWallet.id,
          toWalletId: null,
          amount: ourFee,
          description: 'Frais de transaction MobilePay',
        });
      }

      return transaction;
    });
  }

  /**
   * Paiement marchand financé par la carte virtuelle du payeur (§ parcours
   * Payer repensé) — le formulaire imite un paiement carte classique (nom,
   * 16 chiffres, expiration, CVV), mais la carte étant émise et détenue en
   * interne (pas encore de partenaire émetteur réel connecté), on ne
   * vérifie/stocke jamais un vrai PAN/CVV complet : on confirme que les 4
   * derniers chiffres et la date correspondent bien à LA carte active du
   * titulaire authentifié, puis le code secret autorise le débit.
   */
  async collectForMerchantFromCard(params: {
    payerUserId: string;
    merchantId: string;
    amount: bigint;
    description: string;
    idempotencyKey: string;
    pin: string;
    cardLast4: string;
    expiryMonth: number;
    expiryYear: number;
  }) {
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    await this.verifyTransactionPin(params.payerUserId, params.pin);

    const card = await this.prisma.virtualCard.findFirst({
      where: { ownerUserId: params.payerUserId, status: 'ACTIVE' },
    });
    if (!card) throw new NotFoundException('Aucune carte virtuelle active sur ce compte.');
    if (!card.maskedPan?.endsWith(params.cardLast4) || card.expiryMonth !== params.expiryMonth || card.expiryYear !== params.expiryYear) {
      throw new BadRequestException('Les informations de la carte ne correspondent pas.');
    }
    if (card.balance < params.amount) {
      throw new BadRequestException('Solde de la carte insuffisant.');
    }

    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: params.merchantId } });
    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException("Ce marchand n'est pas actif et ne peut pas encaisser.");
    }

    const merchantFee = this.ledger.computeFee(params.amount, merchant.feeRateBps);
    const netAmount = params.amount - merchantFee;
    const ourFee = await this.pricingService.computeOurFee(params.amount);
    if (card.balance < params.amount + ourFee) {
      throw new BadRequestException('Solde de la carte insuffisant (frais inclus).');
    }

    return this.runSerializable(async (tx) => {
      const merchantWallet = await tx.wallet.findUniqueOrThrow({ where: { merchantId: params.merchantId } });

      const transaction = await tx.transaction.create({
        data: {
          type: 'PAYMENT',
          status: 'SUCCESS',
          amount: params.amount,
          feeAmount: merchantFee + ourFee,
          sourceWalletId: null,
          destWalletId: merchantWallet.id,
          initiatedByUserId: params.payerUserId,
          description: `${params.description} (carte virtuelle)`,
          idempotencyKey: params.idempotencyKey,
        },
      });

      await tx.virtualCard.update({
        where: { id: card.id },
        data: { balance: { decrement: params.amount + ourFee } },
      });

      // § La carte n'est pas un wallet interne au ledger — crédit du
      // marchand sans contrepartie wallet (origine externe), comme pour un
      // approvisionnement manuel.
      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: merchantWallet.id,
        amount: netAmount,
        description: params.description,
      });

      return transaction;
    });
  }

  /**
   * Paiement marchand financé par un Mobile Money externe (§ parcours Payer
   * repensé) — l'argent ne transite jamais par le wallet interne du payeur :
   * HUB2 collecte directement sur son compte Mobile Money, puis le marchand
   * est crédité net des frais une fois la collecte confirmée (webhook).
   */
  async collectForMerchantFromExternal(params: {
    payerUserId: string;
    merchantId: string;
    amount: bigint;
    description: string;
    customerPhone: string;
    provider: string;
    pin: string;
  }, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    await this.verifyTransactionPin(params.payerUserId, params.pin);

    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: params.merchantId } });
    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException('Ce marchand n\'est pas actif et ne peut pas encaisser.');
    }

    const merchantFee = this.ledger.computeFee(params.amount, merchant.feeRateBps);
    const ourFee = await this.pricingService.computeOurFee(params.amount);
    const merchantWallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { merchantId: params.merchantId },
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'PAYMENT',
        status: 'PROCESSING',
        amount: params.amount,
        feeAmount: merchantFee + ourFee,
        destWalletId: merchantWallet.id,
        initiatedByUserId: params.payerUserId,
        description: params.description,
        providerName: 'HUB2',
        idempotencyKey,
      },
    });

    const result = await this.hub2.initiateTopup({
      walletId: '',
      amount: params.amount,
      currency: 'XOF',
      customerPhone: normalizePhoneCI(params.customerPhone, merchant.country as any),
      reference: transaction.id,
      provider: params.provider,
      country: merchant.country,
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerRef: result.providerRef },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'HUB2',
        status: 'PROCESSING',
        providerRef: result.providerRef,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    return { ...transaction, providerRef: result.providerRef };
  }

  /**
   * Débit direct initié par un marchand (§ app Business — Phase A) : collecte
   * HUB2 directement sur le Mobile Money du client, sans exiger que celui-ci
   * soit déjà utilisateur MobilePay ni saisisse de code secret — le client
   * confirme via le prompt USSD/PIN de son propre opérateur, hors MobilePay.
   * C'est le marchand (initiatedByUserId) qui déclenche la demande.
   */
  async debitDirect(
    params: {
      merchantId: string;
      customerPhone: string;
      provider: string;
      amount: bigint;
      description: string;
      initiatedByUserId: string;
    },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: params.merchantId } });
    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException('Ce marchand n\'est pas actif et ne peut pas encaisser.');
    }

    const feeAmount = this.ledger.computeFee(params.amount, merchant.feeRateBps);
    const merchantWallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { merchantId: params.merchantId },
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'PAYMENT',
        status: 'PROCESSING',
        amount: params.amount,
        feeAmount,
        destWalletId: merchantWallet.id,
        initiatedByUserId: params.initiatedByUserId,
        description: params.description,
        providerName: 'HUB2',
        idempotencyKey,
      },
    });

    const result = await this.hub2.initiateTopup({
      walletId: '',
      amount: params.amount,
      currency: 'XOF',
      customerPhone: normalizePhoneCI(params.customerPhone, merchant.country as any),
      reference: transaction.id,
      provider: params.provider,
      country: merchant.country,
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerRef: result.providerRef },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'HUB2',
        status: 'PROCESSING',
        providerRef: result.providerRef,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    return {
      ...transaction,
      providerRef: result.providerRef,
      paymentLink: result.redirectUrl,
      nextActionType: result.nextActionType,
      nextActionMessage: result.nextActionMessage,
    };
  }

  /**
   * Authentifie un Débit direct nécessitant un code OTP (§ nextAction.type
   * === 'otp', ex: Orange) — le client dicte le code généré via son
   * opérateur, le marchand le saisit dans l'app Business pour finaliser.
   */
  async authenticateDebitDirect(transactionId: string, confirmationCode: string) {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { transactionId, providerName: 'HUB2' },
      orderBy: { createdAt: 'desc' },
    });
    if (!attempt) throw new NotFoundException('Aucune tentative de paiement trouvée pour cette transaction.');

    const raw = attempt.rawResponse as any;
    const intentId: string | undefined = raw?.id;
    const token: string | undefined = raw?.token;
    if (!intentId || !token) {
      throw new BadRequestException('Cette transaction ne peut pas être authentifiée par code (données manquantes).');
    }

    return this.hub2.authenticatePayment(intentId, token, confirmationCode);
  }

  /**
   * Utilisateur système "invité" (§ page de paiement publique pay.mobilepay-ci.com)
   * — sert de valeur pour `initiatedByUserId` (champ requis) lorsqu'un client
   * SANS compte MobilePay paie via Mobile Money externe. Créé une seule fois,
   * réutilisé ensuite (jamais de mot de passe fonctionnel, jamais connecté).
   */
  private async getOrCreateGuestUser() {
    const GUEST_PHONE = '+225000000GUEST';
    let guest = await this.prisma.user.findUnique({ where: { phone: GUEST_PHONE } });
    if (!guest) {
      guest = await this.prisma.user.create({
        data: {
          phone: GUEST_PHONE,
          firstName: 'Client',
          lastName: 'Anonyme',
          passwordHash: await bcrypt.hash(crypto.randomUUID(), 4),
          role: 'PARTICULIER',
          isBlocked: true, // ne doit jamais pouvoir se connecter
        },
      });
    }
    return guest;
  }

  /**
   * Paiement public d'un marchand via Mobile Money externe (§ pay.mobilepay-ci.com)
   * — pour un client SANS compte MobilePay, scannant un QR ou ouvrant un lien.
   * Même mécanique que `debitDirect`, mais initiée par le CLIENT lui-même
   * (page publique, sans connexion), pas par le marchand.
   */
  async payMerchantAnonymously(
    params: { merchantId: string; customerPhone: string; provider: string; amount: bigint; description: string },
    idempotencyKey: string,
  ) {
    const guest = await this.getOrCreateGuestUser();
    return this.debitDirect(
      {
        merchantId: params.merchantId,
        customerPhone: params.customerPhone,
        provider: params.provider,
        amount: params.amount,
        description: params.description,
        initiatedByUserId: guest.id,
      },
      idempotencyKey,
    );
  }

  /**
   * Envoie de l'argent à un PARTICULIER via Mobile Money externe (§ QR/lien
   * personnel sur pay.mobilepay-ci.com) — pour un payeur SANS compte MobilePay.
   * Distinct de payMerchantAnonymously : pas de frais marchand, crédite
   * directement le wallet du particulier destinataire, type TRANSFER.
   */
  async payParticulierAnonymously(
    params: { recipientUserId: string; customerPhone: string; provider: string; amount: bigint; description: string },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const recipientWallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { userId: params.recipientUserId },
    });
    const recipientUser = await this.prisma.user.findUniqueOrThrow({ where: { id: params.recipientUserId } });
    const guest = await this.getOrCreateGuestUser();

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'PAYMENT',
        status: 'PROCESSING',
        amount: params.amount,
        feeAmount: 0n,
        destWalletId: recipientWallet.id,
        initiatedByUserId: guest.id,
        description: params.description,
        providerName: 'HUB2',
        idempotencyKey,
      },
    });

    const result = await this.hub2.initiateTopup({
      walletId: '',
      amount: params.amount,
      currency: 'XOF',
      customerPhone: normalizePhoneCI(params.customerPhone, recipientUser.country as any),
      reference: transaction.id,
      provider: params.provider,
      country: recipientUser.country,
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerRef: result.providerRef },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'HUB2',
        status: 'PROCESSING',
        providerRef: result.providerRef,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    return {
      ...transaction,
      providerRef: result.providerRef,
      paymentLink: result.redirectUrl,
      nextActionType: result.nextActionType,
      nextActionMessage: result.nextActionMessage,
    };
  }

  /** Finalise un paiement marchand externe depuis le webhook HUB2. */
  async completeExternalMerchantPayment(transactionId: string, success: boolean, failureReason?: string, hub2FeeAmount: bigint = 0n) {
    return this.runSerializable(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Transaction introuvable.');
      if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED') {
        return transaction; // déjà traité — idempotence webhook
      }

      await this.updateLatestPaymentAttemptStatus(tx, transactionId, success ? 'SUCCESS' : 'FAILED');

      if (!success) {
        return tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'FAILED', failureReason },
        });
      }

      const totalFee = transaction.feeAmount + hub2FeeAmount;
      const netAmount = transaction.amount - totalFee > 0n ? transaction.amount - totalFee : 0n;
      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: transaction.destWalletId!,
        amount: netAmount,
        description: transaction.description ?? 'Paiement marchand (Mobile Money)',
      });

      return tx.transaction.update({ where: { id: transactionId }, data: { status: 'SUCCESS', feeAmount: totalFee } });
    });
  }

  /**
   * Met à jour le statut de la dernière tentative de paiement (§ cohérence
   * historique) — auparavant, seule la Transaction passait à SUCCESS/FAILED,
   * la PaymentAttempt associée restait bloquée en PROCESSING pour toujours.
   */
  private async updateLatestPaymentAttemptStatus(
    tx: Prisma.TransactionClient,
    transactionId: string,
    status: 'SUCCESS' | 'FAILED',
  ) {
    const attempt = await tx.paymentAttempt.findFirst({
      where: { transactionId },
      orderBy: { createdAt: 'desc' },
    });
    if (attempt) {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status } });
    }
  }

  /**
   * Confirme une demande de paiement (§12 option 4) créée en PENDING par un
   * marchand. Seul le client destinataire (le payeur désigné) peut la confirmer —
   * c'est ce contrôle qui rend le "pull payment" sûr.
   */
  async confirmPendingPayment(transactionId: string, confirmingUserId: string) {
    return this.runSerializable(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Transaction introuvable.');
      if (transaction.initiatedByUserId !== confirmingUserId) {
        throw new BadRequestException('Cette demande de paiement ne vous est pas destinée.');
      }
      if (transaction.status !== 'PENDING') {
        return transaction; // déjà confirmée, expirée ou annulée — idempotent
      }
      if (!transaction.destWalletId) {
        throw new BadRequestException('Transaction invalide : wallet destinataire manquant.');
      }

      const payerWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: confirmingUserId } });

      await tx.transaction.update({
        where: { id: transactionId },
        data: { sourceWalletId: payerWallet.id, status: 'SUCCESS' },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: payerWallet.id,
        toWalletId: transaction.destWalletId,
        amount: transaction.amount,
        description: transaction.description ?? 'Paiement confirmé',
      });

      return tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    });
  }

  /**
   * Achat de crédit téléphonique ou forfait data (Airtime/Data, §29) — point
   * d'entrée unique qui distribue vers l'une des trois sources de paiement
   * possibles. Quelle que soit la source, Reloadly confirme en synchrone et
   * un échec après débit déclenche toujours un remboursement immédiat.
   */
  async purchaseAirtime(
    userId: string,
    params: {
      phoneNumber: string;
      operatorId?: string;
      amount: bigint;
      kind: 'AIRTIME' | 'DATA';
      paymentMethod: 'WALLET' | 'MOBILE_MONEY' | 'CARD';
      cardId?: string;
      momoProvider?: string;
      countryCode?: string;
    },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    switch (params.paymentMethod) {
      case 'CARD':
        // La Carte virtuelle est un chantier séparé, pas encore livré sur cet
        // environnement (module + migration Prisma à venir) — on refuse
        // explicitement plutôt que de laisser un flux à moitié fonctionnel.
        throw new BadRequestException(
          'Le paiement par carte virtuelle sera bientôt disponible — utilisez le solde MobilePay ou Mobile Money en attendant.',
        );
      case 'MOBILE_MONEY':
        return this.purchaseAirtimeFromMobileMoney(userId, params, idempotencyKey);
      case 'WALLET':
      default:
        return this.purchaseAirtimeFromWallet(userId, params, idempotencyKey);
    }
  }

  /** Catalogue de cartes cadeaux disponibles pour un pays (§ Gift Cards). */
  async listGiftCardProducts(countryCode: string) {
    return this.reloadlyGiftCards.listProducts(countryCode);
  }

  /**
   * Achat de carte cadeau depuis le wallet particulier — débit immédiat
   * (atomique, interne), remboursement automatique si Reloadly échoue.
   */
  async purchaseGiftCard(
    userId: string,
    params: { productId: number; unitPrice: number; recipientEmail: string; pin: string; countryCode?: string },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    await this.verifyTransactionPin(userId, params.pin);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const product = await this.reloadlyGiftCards.getProduct(params.productId);
    if (!product) throw new NotFoundException('Carte cadeau introuvable.');
    const countryCode = params.countryCode ?? product.countryIso ?? 'CI';

    const amount = BigInt(Math.round(params.unitPrice * 100));
    const ourFee = await this.pricingService.computeOurFee(amount);

    const transaction = await this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.cachedBalance < amount + ourFee) {
        throw new BadRequestException('Solde insuffisant (frais inclus).');
      }

      const created = await tx.transaction.create({
        data: {
          type: 'GIFT_CARD',
          status: 'PROCESSING',
          amount,
          feeAmount: ourFee,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Carte cadeau ${product.brandName} — ${params.recipientEmail}`,
          providerName: 'RELOADLY',
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: created.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount,
        description: `Carte cadeau ${product.brandName}`,
      });

      if (ourFee > 0n) {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: created.id,
          fromWalletId: wallet.id,
          toWalletId: null,
          amount: ourFee,
          description: 'Frais de transaction MobilePay',
        });
      }

      return created;
    });

    const result = await this.reloadlyGiftCards.placeOrder({
      productId: params.productId,
      unitPrice: params.unitPrice,
      recipientEmail: params.recipientEmail,
      senderName: `${user.firstName} ${user.lastName}`,
      customIdentifier: transaction.id,
      countryCode,
    });

    await this.prisma.giftCardOrder.create({
      data: {
        transactionId: transaction.id,
        targetType: 'PARTICULIER',
        targetUserId: userId,
        productId: params.productId,
        productName: product.productName,
        brandName: product.brandName,
        denominationValue: params.unitPrice,
        currencyCode: result.currencyCode || product.recipientCurrencyCode,
        recipientEmail: params.recipientEmail,
        senderName: `${user.firstName} ${user.lastName}`,
        status: result.status,
        cardCode: result.cardCode,
        cardPin: result.cardPin,
        redeemInstructions: product.redeemInstructions,
        failureReason: result.status === 'FAILED' ? 'Achat Reloadly refusé.' : null,
      },
    });

    if (result.status === 'FAILED') {
      // Remboursement — le débit était interne et instantané, l'annuler est sûr.
      await this.runSerializable(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: null,
          toWalletId: wallet.id,
          amount: amount + ourFee,
          description: `Remboursement — échec carte cadeau ${product.brandName}`,
        });
      });
      return this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: 'Achat de la carte cadeau refusé par le fournisseur.' },
      });
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SUCCESS' },
    });
    return { ...updated, cardCode: result.cardCode, cardPin: result.cardPin };
  }

  /** Liste des billers (factures) disponibles pour un pays (§ Utility Payments). */
  async listUtilityBillers(countryCode: string, type?: BillerType) {
    return this.reloadlyUtilities.listBillers(countryCode, type);
  }

  /**
   * Paiement de facture depuis le wallet particulier — débit immédiat,
   * remboursement automatique si Reloadly échoue.
   */
  async payUtilityBill(
    userId: string,
    params: { billerId: number; billerName: string; billType: string; subscriberAccountNumber: string; amount: number; pin: string },
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    await this.verifyTransactionPin(userId, params.pin);
    const amount = BigInt(Math.round(params.amount * 100));
    const ourFee = await this.pricingService.computeOurFee(amount);

    const transaction = await this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.cachedBalance < amount + ourFee) {
        throw new BadRequestException('Solde insuffisant (frais inclus).');
      }

      const created = await tx.transaction.create({
        data: {
          type: 'UTILITY_PAYMENT',
          status: 'PROCESSING',
          amount,
          feeAmount: ourFee,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Facture ${params.billerName} — ${params.subscriberAccountNumber}`,
          providerName: 'RELOADLY',
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: created.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount,
        description: `Facture ${params.billerName}`,
      });

      if (ourFee > 0n) {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: created.id,
          fromWalletId: wallet.id,
          toWalletId: null,
          amount: ourFee,
          description: 'Frais de transaction MobilePay',
        });
      }

      return created;
    });

    const result = await this.reloadlyUtilities.payBill({
      billerId: params.billerId,
      subscriberAccountNumber: params.subscriberAccountNumber,
      amount: params.amount,
      referenceId: transaction.id,
    });

    await this.prisma.utilityPaymentRecord.create({
      data: {
        transactionId: transaction.id,
        targetType: 'PARTICULIER',
        targetUserId: userId,
        billerId: params.billerId,
        billerName: params.billerName,
        billType: params.billType,
        subscriberAccountNumber: params.subscriberAccountNumber,
        amount: params.amount,
        currencyCode: result.currencyCode,
        status: result.status,
        failureReason: result.status === 'FAILED' ? 'Paiement Reloadly refusé.' : null,
      },
    });

    if (result.status === 'FAILED') {
      await this.runSerializable(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: null,
          toWalletId: wallet.id,
          amount: amount + ourFee,
          description: `Remboursement — échec facture ${params.billerName}`,
        });
      });
      return this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: 'Paiement de facture refusé par le fournisseur.' },
      });
    }

    return this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: result.status === 'PROCESSING' ? 'PROCESSING' : 'SUCCESS' },
    });
  }

  /** Source : solde du wallet MobilePay — débit immédiat, remboursement si échec. */
  private async purchaseAirtimeFromWallet(
    userId: string,
    params: { phoneNumber: string; operatorId?: string; amount: bigint; kind: 'AIRTIME' | 'DATA'; countryCode?: string },
    idempotencyKey: string,
  ) {
    const label = params.kind === 'DATA' ? 'Forfait data' : 'Recharge crédit';
    const buyer = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const countryCode = params.countryCode ?? buyer.country;
    const ourFee = await this.pricingService.computeOurFee(params.amount);

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      const transaction = await tx.transaction.create({
        data: {
          type: 'AIRTIME',
          status: 'PROCESSING',
          amount: params.amount,
          feeAmount: ourFee,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `${label} ${params.phoneNumber} (wallet)`,
          providerName: 'RELOADLY',
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount: params.amount,
        description: `${label} ${params.phoneNumber}`,
      });

      // § Nos frais internes (§ tarification) — débit supplémentaire, le
      // destinataire reçoit bien le montant plein demandé sur son téléphone.
      if (ourFee > 0n) {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: wallet.id,
          toWalletId: null,
          amount: ourFee,
          description: 'Frais de transaction MobilePay',
        });
      }

      const result = await this.reloadly.purchaseAirtime({
        phoneNumber: params.phoneNumber,
        operatorId: params.operatorId,
        amount: params.amount,
        kind: params.kind,
        reference: transaction.id,
        countryCode,
      });

      const finalStatus = result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

      await tx.paymentAttempt.create({
        data: {
          transactionId: transaction.id,
          providerName: 'RELOADLY',
          status: finalStatus,
          providerRef: result.providerRef,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      });

      if (finalStatus === 'FAILED') {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: null,
          toWalletId: wallet.id,
          amount: params.amount + ourFee,
          description: `Remboursement — échec ${label.toLowerCase()}`,
        });
      }

      return tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: finalStatus,
          providerRef: result.providerRef,
          operatorId: params.operatorId,
          operatorName: result.operatorName,
          airtimeKind: params.kind,
        },
      });
    }).then(async (transaction) => {
      if (transaction.status === 'SUCCESS') {
        await this.notifyAirtimeDelivery(params.phoneNumber, params.amount, params.kind, transaction.operatorName);
      }
      return transaction;
    });
  }

  /** Confirme par SMS la livraison d'un crédit/forfait data (§ Reloadly). */
  private async notifyAirtimeDelivery(phoneNumber: string, amount: bigint, kind: 'AIRTIME' | 'DATA', operatorName?: string | null) {
    const label = kind === 'DATA' ? 'forfait data' : 'crédit';
    const amountLabel = (Number(amount) / 100).toLocaleString('fr-FR');
    const message = `MobilePay CI : ton ${label} de ${amountLabel} FCFA${operatorName ? ` (${operatorName})` : ''} a été livré avec succès.`;
    await this.sms.send(phoneNumber, message).catch(() => null); // notification best-effort — n'échoue jamais l'achat lui-même
  }

  /**
   * Source : Mobile Money externe (Orange Money/MTN MoMo/Moov/Wave, hors wallet
   * MobilePay) via HUB2. SIMPLIFICATION MVP assumée et documentée : en l'absence
   * d'infrastructure de test pour le webhook HUB2 dans ce flux précis, la
   * collecte est traitée comme confirmée dès la réponse initiale de HUB2 (déjà
   * simulée en local sans credentials — voir Hub2Adapter), puis l'achat Reloadly
   * est déclenché immédiatement. Une vraie mise en production devrait attendre
   * la confirmation du webhook HUB2 avant de déclencher Reloadly (nécessite un
   * champ de métadonnées sur Transaction pour porter operatorId/kind entre les
   * deux étapes asynchrones — TODO Phase 6).
   */
  /**
   * § Correction sécurité — Reloadly n'est JAMAIS appelé ici. On se contente
   * de lancer la collecte HUB2 et de mémoriser les détails de l'achat ;
   * c'est le webhook (§ completeAirtimeMobileMoneyDeposit), une fois le
   * paiement du client réellement confirmé, qui déclenche Reloadly.
   */
  private async purchaseAirtimeFromMobileMoney(
    userId: string,
    params: {
      phoneNumber: string;
      operatorId?: string;
      amount: bigint;
      kind: 'AIRTIME' | 'DATA';
      momoProvider?: string;
      countryCode?: string;
    },
    idempotencyKey: string,
  ) {
    if (!params.momoProvider) {
      throw new BadRequestException("L'opérateur Mobile Money du payeur est requis.");
    }
    const label = params.kind === 'DATA' ? 'Forfait data' : 'Recharge crédit';
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const countryCode = params.countryCode ?? user.country;

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'AIRTIME',
        status: 'PROCESSING',
        amount: params.amount,
        initiatedByUserId: userId,
        description: `${label} ${params.phoneNumber} (Mobile Money) — en attente de confirmation du paiement`,
        providerName: 'HUB2',
        operatorId: params.operatorId,
        airtimeKind: params.kind,
        idempotencyKey,
      },
    });

    await this.prisma.pendingAirtimeDelivery.create({
      data: {
        transactionId: transaction.id,
        phoneNumber: params.phoneNumber,
        operatorId: params.operatorId,
        kind: params.kind,
        countryCode,
      },
    });

    const collection = await this.hub2.initiateTopup({
      walletId: '', // collecte externe, non liée à un wallet interne
      amount: params.amount,
      currency: 'XOF',
      customerPhone: user.phone,
      reference: transaction.id,
      provider: params.momoProvider,
      country: countryCode,
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerRef: collection.providerRef },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'HUB2',
        status: 'PROCESSING',
        providerRef: collection.providerRef,
        rawResponse: collection.raw as Prisma.InputJsonValue,
      },
    });

    return {
      ...transaction,
      providerRef: collection.providerRef,
      nextActionType: collection.nextActionType,
      nextActionMessage: collection.nextActionMessage,
    };
  }

  /**
   * Appelé par WebhooksService une fois le paiement Mobile Money du client
   * CONFIRMÉ (succès ou échec réel, jamais une supposition) — ne déclenche
   * Reloadly que si le paiement a effectivement réussi.
   */
  async completeAirtimeMobileMoneyDeposit(transactionId: string, paymentSuccess: boolean, failureReason?: string, hub2FeeAmount: bigint = 0n) {
    const transaction = await this.prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED') {
      return transaction; // déjà traité — idempotence webhook
    }

    if (!paymentSuccess) {
      // Le client n'a pas payé (ou a annulé) — aucun crédit envoyé, aucune
      // perte pour MobilePay. C'est précisément le cas que corrige ce chantier.
      return this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'FAILED', failureReason: failureReason ?? "Le paiement n'a pas pu être confirmé." },
      });
    }

    const pending = await this.prisma.pendingAirtimeDelivery.findUnique({ where: { transactionId } });
    if (!pending) {
      // Ne devrait jamais arriver — garde-fou pour éviter un crash silencieux.
      return this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'FAILED', failureReason: 'Détails de livraison introuvables.' },
      });
    }

    // § Le client paie le montant plein sur son Mobile Money ; nos frais +
    // ceux de HUB2 réduisent le montant réellement acheté chez Reloadly
    // (même logique que le Dépôt — cohérence de la tarification).
    const ourFee = await this.pricingService.computeOurFee(transaction.amount);
    const totalFee = ourFee + hub2FeeAmount;
    const purchaseAmount = transaction.amount - totalFee > 0n ? transaction.amount - totalFee : 0n;

    const result = await this.reloadly.purchaseAirtime({
      phoneNumber: pending.phoneNumber,
      operatorId: pending.operatorId ?? undefined,
      amount: purchaseAmount,
      kind: pending.kind as 'AIRTIME' | 'DATA',
      reference: transaction.id,
      countryCode: pending.countryCode,
    });

    const finalStatus = result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'RELOADLY',
        status: finalStatus,
        providerRef: result.providerRef,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    // Cas rare mais réel : le client a bien payé, mais Reloadly échoue quand
    // même (rupture de stock opérateur, etc.) — le paiement collecté doit
    // alors être remboursé manuellement côté HUB2 (hors automatisation ici,
    // à traiter par un admin via l'historique des transactions).
    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: finalStatus,
        feeAmount: totalFee,
        operatorName: result.operatorName,
        failureReason: finalStatus === 'FAILED' ? 'Paiement reçu mais échec de la livraison Reloadly — remboursement à traiter manuellement.' : undefined,
      },
    });

    if (updated.status === 'SUCCESS') {
      await this.notifyAirtimeDelivery(pending.phoneNumber, transaction.amount, pending.kind as 'AIRTIME' | 'DATA', updated.operatorName);
    }

    return updated;
  }

  /** Initie une recharge de wallet particulier via HUB2 (cash-in mobile money). */
  async initiateTopup(
    userId: string,
    params: { operator: 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN'; accountNumber: string; amount: bigint; pin: string },
  ) {
    await this.verifyTransactionPin(userId, params.pin);

    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const reference = `TOPUP-${nanoid(12)}`;
    const label = OPERATOR_LABELS[params.operator];

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'TOPUP',
        status: 'PENDING',
        amount: params.amount,
        destWalletId: wallet.id,
        initiatedByUserId: userId,
        description: `Recharge via ${label} — ${params.accountNumber}`,
        providerName: 'HUB2',
        idempotencyKey: reference,
        operatorId: params.operator,
        operatorName: label,
      },
    });

    const result = await this.hub2.initiateTopup({
      walletId: wallet.id,
      amount: params.amount,
      currency: wallet.currency,
      customerPhone: normalizePhoneCI(params.accountNumber, user.country as any),
      reference: transaction.id,
      provider: params.operator.toLowerCase(),
      country: user.country,
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { providerRef: result.providerRef, status: 'PROCESSING' },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        transactionId: transaction.id,
        providerName: 'HUB2',
        status: 'PROCESSING',
        providerRef: result.providerRef,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    return { transactionId: transaction.id, status: 'PROCESSING', providerRef: result.providerRef };
  }

  /**
   * Appelé par WebhooksService une fois la signature HUB2 vérifiée : finalise
   * le top-up en créditant réellement le wallet, ou marque l'échec.
   */
  async completeTopup(transactionId: string, success: boolean, failureReason?: string, hub2FeeAmount: bigint = 0n) {
    // § La tarification (§ pourcentage + frais fixe MobilePay, paramétrable
    // en back-office) doit être calculée AVANT la transaction Prisma — un
    // appel réseau/DB externe dans une transaction Serializable risquerait
    // un conflit de verrou inutile.
    const transactionBefore = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    const ourFee = transactionBefore ? await this.pricingService.computeOurFee(transactionBefore.amount) : 0n;
    const totalFee = hub2FeeAmount + ourFee;

    return this.runSerializable(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Transaction introuvable.');
      if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED') {
        return transaction; // déjà traité — idempotence webhook
      }

      await this.updateLatestPaymentAttemptStatus(tx, transactionId, success ? 'SUCCESS' : 'FAILED');

      if (!success) {
        return tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'FAILED', failureReason },
        });
      }

      // § Le client reçoit le montant net des frais (HUB2 + MobilePay) —
      // cohérent avec la pratique standard des opérateurs mobile money.
      const netAmount = transaction.amount - totalFee > 0n ? transaction.amount - totalFee : 0n;

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: transaction.destWalletId!,
        amount: netAmount,
        description: 'Recharge confirmée (HUB2)',
      });

      return tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'SUCCESS', feeAmount: totalFee },
      });
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
}
