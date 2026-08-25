import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { Hub2Adapter } from './providers/hub2.adapter';

const MAX_SERIALIZATION_RETRIES = 3;

@Injectable()
export class PaymentEngineService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private hub2: Hub2Adapter,
  ) {}

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
  }) {
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: params.merchantId },
    });

    if (merchant.status !== 'ACTIVE') {
      throw new BadRequestException('Ce marchand n\'est pas actif et ne peut pas encaisser.');
    }

    const feeAmount = this.ledger.computeFee(params.amount, merchant.feeRateBps);
    const netAmount = params.amount - feeAmount;

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
          feeAmount,
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
      if (feeAmount > 0n) {
        await this.ledger.postDoubleEntry(tx, {
          transactionId: transaction.id,
          fromWalletId: payerWallet.id,
          toWalletId: null,
          amount: feeAmount,
          description: 'Frais MobilePay',
        });
      }

      return transaction;
    });
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

  /** Initie une recharge de wallet particulier via HUB2 (cash-in mobile money). */
  async initiateTopup(userId: string, amount: bigint, customerPhone: string) {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const reference = `TOPUP-${nanoid(12)}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'TOPUP',
        status: 'PENDING',
        amount,
        destWalletId: wallet.id,
        initiatedByUserId: userId,
        description: 'Recharge via HUB2',
        providerName: 'HUB2',
        idempotencyKey: reference,
      },
    });

    const result = await this.hub2.initiateTopup({
      walletId: wallet.id,
      amount,
      currency: wallet.currency,
      customerPhone,
      reference: transaction.id,
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
  async completeTopup(transactionId: string, success: boolean, failureReason?: string) {
    return this.runSerializable(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Transaction introuvable.');
      if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED') {
        return transaction; // déjà traité — idempotence webhook
      }

      if (!success) {
        return tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'FAILED', failureReason },
        });
      }

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: transaction.destWalletId!,
        amount: transaction.amount,
        description: 'Recharge confirmée (HUB2)',
      });

      return tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'SUCCESS' },
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
