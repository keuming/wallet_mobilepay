import { Injectable, BadRequestException, ForbiddenException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LockoutService } from '../security/lockout.service';

const MAX_RETRIES = 3;

@Injectable()
export class CollecteService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private lockout: LockoutService,
  ) {}

  private async runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (err: any) {
        const isConflict = err?.code === 'P2034' || err?.meta?.code === '40001';
        if (isConflict && attempt < MAX_RETRIES) continue;
        throw err;
      }
    }
    throw new Error('Échec après plusieurs tentatives.');
  }

  private async verifyPin(userId: string, pin: string) {
    await this.lockout.assertNotLocked(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.transactionPinHash) {
      throw new BadRequestException("Créez d'abord un code secret (menu → Modifier mon code secret).");
    }
    const valid = await bcrypt.compare(pin, user.transactionPinHash);
    if (!valid) {
      await this.lockout.recordFailure(userId);
      throw new UnauthorizedException('Code secret incorrect.');
    }
    await this.lockout.recordSuccess(userId);
  }

  // ---------- Types de collecte ----------

  async listTypes(userId: string) {
    return this.prisma.collectionType.findMany({ where: { userId }, orderBy: { label: 'asc' } });
  }

  async createType(userId: string, label: string, icon?: string) {
    const trimmed = label.trim();
    if (!trimmed) throw new BadRequestException('Le nom de la collecte est requis.');
    const existing = await this.prisma.collectionType.findFirst({ where: { userId, label: trimmed } });
    if (existing) throw new BadRequestException('Cette collecte existe déjà.');
    return this.prisma.collectionType.create({ data: { userId, label: trimmed, icon } });
  }

  async deleteType(userId: string, typeId: string) {
    const type = await this.prisma.collectionType.findUnique({ where: { id: typeId } });
    if (!type) throw new NotFoundException('Collecte introuvable.');
    if (type.userId !== userId) throw new ForbiddenException("Cette collecte ne vous appartient pas.");
    if (type.balance > 0n) {
      throw new BadRequestException('Retirez le solde de cette collecte vers votre wallet avant de la supprimer.');
    }
    await this.prisma.collectionType.delete({ where: { id: typeId } });
    return { deleted: true };
  }

  // ---------- Approvisionnement / retrait ----------

  async deposit(userId: string, typeId: string, amountFcfa: number, pin: string, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    await this.verifyPin(userId, pin);

    const type = await this.prisma.collectionType.findUnique({ where: { id: typeId } });
    if (!type || type.userId !== userId) throw new NotFoundException('Collecte introuvable.');

    const amount = BigInt(Math.round(amountFcfa * 100));
    if (amount <= 0n) throw new BadRequestException('Montant invalide.');

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.cachedBalance < amount) throw new BadRequestException('Solde insuffisant.');

      const transaction = await tx.transaction.create({
        data: {
          type: 'COLLECTE_LOAD',
          status: 'SUCCESS',
          amount,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Approvisionnement collecte "${type.label}"`,
          collectionTypeId: type.id,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount,
        description: `Collecte "${type.label}"`,
      });

      await tx.collectionType.update({ where: { id: typeId }, data: { balance: { increment: amount } } });

      return transaction;
    });
  }

  async withdraw(userId: string, typeId: string, amountFcfa: number, pin: string, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    await this.verifyPin(userId, pin);

    const type = await this.prisma.collectionType.findUnique({ where: { id: typeId } });
    if (!type || type.userId !== userId) throw new NotFoundException('Collecte introuvable.');

    const amount = BigInt(Math.round(amountFcfa * 100));
    if (amount <= 0n) throw new BadRequestException('Montant invalide.');
    if (type.balance < amount) throw new BadRequestException('Solde de la collecte insuffisant.');

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      const transaction = await tx.transaction.create({
        data: {
          type: 'COLLECTE_UNLOAD',
          status: 'SUCCESS',
          amount,
          destWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Retrait collecte "${type.label}"`,
          collectionTypeId: type.id,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: wallet.id,
        amount,
        description: `Retrait collecte "${type.label}"`,
      });

      await tx.collectionType.update({ where: { id: typeId }, data: { balance: { decrement: amount } } });

      return transaction;
    });
  }

  // ---------- Types d'épargne (§ "Épargne Gold" — même logique que Collecte) ----------

  async listSavingsTypes(userId: string) {
    return this.prisma.savingsType.findMany({ where: { userId }, orderBy: { label: 'asc' } });
  }

  async createSavingsType(userId: string, label: string, icon?: string) {
    const trimmed = label.trim();
    if (!trimmed) throw new BadRequestException("Le nom de l'épargne est requis.");
    const existing = await this.prisma.savingsType.findFirst({ where: { userId, label: trimmed } });
    if (existing) throw new BadRequestException('Cette épargne existe déjà.');
    return this.prisma.savingsType.create({ data: { userId, label: trimmed, icon } });
  }

  async deleteSavingsType(userId: string, typeId: string) {
    const type = await this.prisma.savingsType.findUnique({ where: { id: typeId } });
    if (!type) throw new NotFoundException('Épargne introuvable.');
    if (type.userId !== userId) throw new ForbiddenException("Cette épargne ne vous appartient pas.");
    if (type.balance > 0n) {
      throw new BadRequestException('Retirez le solde de cette épargne vers votre wallet avant de la supprimer.');
    }
    await this.prisma.savingsType.delete({ where: { id: typeId } });
    return { deleted: true };
  }

  async depositSavings(userId: string, typeId: string, amountFcfa: number, pin: string, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    await this.verifyPin(userId, pin);

    const type = await this.prisma.savingsType.findUnique({ where: { id: typeId } });
    if (!type || type.userId !== userId) throw new NotFoundException('Épargne introuvable.');

    const amount = BigInt(Math.round(amountFcfa * 100));
    if (amount <= 0n) throw new BadRequestException('Montant invalide.');

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.cachedBalance < amount) throw new BadRequestException('Solde insuffisant.');

      const transaction = await tx.transaction.create({
        data: {
          type: 'GOLD_LOAD',
          status: 'SUCCESS',
          amount,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Épargne "${type.label}"`,
          savingsTypeId: type.id,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount,
        description: `Épargne "${type.label}"`,
      });

      await tx.savingsType.update({ where: { id: typeId }, data: { balance: { increment: amount } } });

      return transaction;
    });
  }

  async withdrawSavings(userId: string, typeId: string, amountFcfa: number, pin: string, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    await this.verifyPin(userId, pin);

    const type = await this.prisma.savingsType.findUnique({ where: { id: typeId } });
    if (!type || type.userId !== userId) throw new NotFoundException('Épargne introuvable.');

    const amount = BigInt(Math.round(amountFcfa * 100));
    if (amount <= 0n) throw new BadRequestException('Montant invalide.');
    if (type.balance < amount) throw new BadRequestException("Solde de l'épargne insuffisant.");

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      const transaction = await tx.transaction.create({
        data: {
          type: 'GOLD_UNLOAD',
          status: 'SUCCESS',
          amount,
          destWalletId: wallet.id,
          initiatedByUserId: userId,
          description: `Retrait épargne "${type.label}"`,
          savingsTypeId: type.id,
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: wallet.id,
        amount,
        description: `Retrait épargne "${type.label}"`,
      });

      await tx.savingsType.update({ where: { id: typeId }, data: { balance: { decrement: amount } } });

      return transaction;
    });
  }

  // ---------- Épargne Gold ----------

  async depositGold(userId: string, amountFcfa: number, pin: string, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    await this.verifyPin(userId, pin);

    const amount = BigInt(Math.round(amountFcfa * 100));
    if (amount <= 0n) throw new BadRequestException('Montant invalide.');

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.cachedBalance < amount) throw new BadRequestException('Solde insuffisant.');

      const transaction = await tx.transaction.create({
        data: {
          type: 'GOLD_LOAD',
          status: 'SUCCESS',
          amount,
          sourceWalletId: wallet.id,
          initiatedByUserId: userId,
          description: 'Approvisionnement Épargne Gold',
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: wallet.id,
        toWalletId: null,
        amount,
        description: 'Épargne Gold',
      });

      await tx.wallet.update({ where: { id: wallet.id }, data: { goldSavingsBalance: { increment: amount } } });

      return transaction;
    });
  }

  async withdrawGold(userId: string, amountFcfa: number, pin: string, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    await this.verifyPin(userId, pin);

    const amount = BigInt(Math.round(amountFcfa * 100));
    if (amount <= 0n) throw new BadRequestException('Montant invalide.');

    return this.runSerializable(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.goldSavingsBalance < amount) throw new BadRequestException('Solde Épargne Gold insuffisant.');

      const transaction = await tx.transaction.create({
        data: {
          type: 'GOLD_UNLOAD',
          status: 'SUCCESS',
          amount,
          destWalletId: wallet.id,
          initiatedByUserId: userId,
          description: 'Retrait Épargne Gold',
          idempotencyKey,
        },
      });

      await this.ledger.postDoubleEntry(tx, {
        transactionId: transaction.id,
        fromWalletId: null,
        toWalletId: wallet.id,
        amount,
        description: 'Retrait Épargne Gold',
      });

      await tx.wallet.update({ where: { id: wallet.id }, data: { goldSavingsBalance: { decrement: amount } } });

      return transaction;
    });
  }
}
