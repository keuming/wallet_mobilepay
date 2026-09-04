import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/** Types de transaction considérés comme des "dépenses" (§ relevé) —
 * exclut les dépôts (entrées d'argent), inclut tout ce qui sort du wallet. */
const EXPENSE_TYPES = ['TRANSFER', 'PAYMENT', 'AIRTIME', 'GIFT_CARD', 'UTILITY_PAYMENT'];

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // --- Types de charges (catégories personnalisées) ---

  async listCategories(userId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { userId },
      orderBy: { label: 'asc' },
    });
  }

  async createCategory(userId: string, label: string, icon?: string) {
    const trimmed = label.trim();
    if (!trimmed) throw new BadRequestException('Le nom de la catégorie est requis.');
    const existing = await this.prisma.expenseCategory.findFirst({ where: { userId, label: trimmed } });
    if (existing) throw new BadRequestException('Cette catégorie existe déjà.');
    return this.prisma.expenseCategory.create({ data: { userId, label: trimmed, icon } });
  }

  async deleteCategory(userId: string, categoryId: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new BadRequestException('Catégorie introuvable.');
    if (category.userId !== userId) throw new ForbiddenException('Cette catégorie ne vous appartient pas.');
    await this.prisma.expenseCategory.delete({ where: { id: categoryId } });
    return { deleted: true };
  }

  // --- Relevé de dépenses ---

  /**
   * Liste des dépenses de l'utilisateur sur une période donnée, avec le
   * total dépensé — permet de suivre son budget à tout moment du mois.
   */
  async getStatement(userId: string, from?: string, to?: string, categoryId?: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new BadRequestException('Wallet introuvable.');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        sourceWalletId: wallet.id,
        type: { in: EXPENSE_TYPES as any },
        status: 'SUCCESS',
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        ...(categoryId ? { expenseCategoryId: categoryId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const categories = await this.prisma.expenseCategory.findMany({ where: { userId } });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const items = transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      description: tx.description,
      amount: tx.amount.toString(),
      feeAmount: tx.feeAmount.toString(),
      createdAt: tx.createdAt,
      category: tx.expenseCategoryId ? categoryMap.get(tx.expenseCategoryId) ?? null : null,
    }));

    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount + tx.feeAmount, 0n);

    return {
      items,
      totalAmount: totalAmount.toString(),
      count: items.length,
    };
  }

  /** Associe une catégorie de dépense à une transaction déjà créée. */
  async setTransactionCategory(userId: string, transactionId: string, categoryId: string | null) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new BadRequestException('Transaction introuvable.');
    if (transaction.initiatedByUserId !== userId) throw new ForbiddenException('Cette transaction ne vous appartient pas.');

    if (categoryId) {
      const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId } });
      if (!category || category.userId !== userId) throw new BadRequestException('Catégorie invalide.');
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { expenseCategoryId: categoryId },
    });
  }
}
