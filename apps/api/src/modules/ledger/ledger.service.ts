import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, LedgerEntryType } from '@prisma/client';

/**
 * LedgerService — moteur comptable en partie double (§24 du cahier des charges).
 *
 * Règle d'or : ON N'ÉCRIT JAMAIS DIRECTEMENT `wallet.cachedBalance` EN DEHORS
 * DE CE SERVICE. Toute variation de solde DOIT passer par `postDoubleEntry()`,
 * appelé à l'intérieur d'une transaction Prisma `SERIALIZABLE` fournie par
 * l'appelant (WalletsService, PaymentEngineService...).
 *
 * Pourquoi SERIALIZABLE : deux transferts concurrents depuis le même wallet
 * (ex: double-clic, requête rejouée) ne doivent jamais tous les deux réussir
 * si le solde ne le permet qu'une fois. Postgres détecte le conflit de
 * sérialisation et lève une erreur que l'appelant doit retry ou traduire en 409.
 */
@Injectable()
export class LedgerService {
  /**
   * Écrit un mouvement de partie double équilibré : un débit sur `fromWalletId`
   * et un crédit sur `toWalletId`, pour le même montant. Un des deux peut être
   * omis (ex: TOPUP n'a pas de wallet source interne — l'argent vient de l'extérieur
   * via un provider — REFUND peut n'avoir qu'un crédit, etc.), mais jamais les deux.
   */
  async postDoubleEntry(
    tx: Prisma.TransactionClient,
    params: {
      transactionId: string;
      fromWalletId?: string | null;
      toWalletId?: string | null;
      amount: bigint;
      description: string;
    },
  ) {
    const { transactionId, fromWalletId, toWalletId, amount, description } = params;

    if (amount <= 0n) {
      throw new BadRequestException('Le montant d\'un mouvement comptable doit être positif.');
    }
    if (!fromWalletId && !toWalletId) {
      throw new BadRequestException('Un mouvement comptable doit toucher au moins un wallet.');
    }

    if (fromWalletId) {
      await this.debit(tx, { transactionId, walletId: fromWalletId, amount, description });
    }
    if (toWalletId) {
      await this.credit(tx, { transactionId, walletId: toWalletId, amount, description });
    }
  }

  private async debit(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; walletId: string; amount: bigint; description: string },
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: params.walletId } });

    if (wallet.isFrozen) {
      throw new BadRequestException('Ce wallet est gelé et ne peut pas émettre de fonds.');
    }
    if (wallet.cachedBalance < params.amount) {
      throw new BadRequestException('Solde insuffisant.');
    }

    const newBalance = wallet.cachedBalance - params.amount;

    // Optimistic locking : on incrémente `version` et on vérifie qu'aucune autre
    // transaction n'a modifié ce wallet entre notre lecture et notre écriture.
    // Avec SERIALIZABLE, Postgres empêcherait de toute façon l'anomalie ; ce
    // compteur reste utile pour le debug et pour un futur mode READ COMMITTED.
    await tx.wallet.update({
      where: { id: wallet.id, version: wallet.version },
      data: { cachedBalance: newBalance, version: { increment: 1 } },
    });

    await tx.ledgerEntry.create({
      data: {
        transactionId: params.transactionId,
        walletId: wallet.id,
        type: LedgerEntryType.DEBIT,
        amount: params.amount,
        balanceAfter: newBalance,
        description: params.description,
      },
    });
  }

  private async credit(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; walletId: string; amount: bigint; description: string },
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: params.walletId } });
    const newBalance = wallet.cachedBalance + params.amount;

    await tx.wallet.update({
      where: { id: wallet.id, version: wallet.version },
      data: { cachedBalance: newBalance, version: { increment: 1 } },
    });

    await tx.ledgerEntry.create({
      data: {
        transactionId: params.transactionId,
        walletId: wallet.id,
        type: LedgerEntryType.CREDIT,
        amount: params.amount,
        balanceAfter: newBalance,
        description: params.description,
      },
    });
  }

  /** Calcule les frais MobilePay en points de base (bps). 200 bps = 2%. */
  computeFee(amount: bigint, feeRateBps: number): bigint {
    return (amount * BigInt(feeRateBps)) / 10_000n;
  }
}
