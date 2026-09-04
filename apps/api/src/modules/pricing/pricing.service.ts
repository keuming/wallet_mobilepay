import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const DEFAULT_KEY = 'PARTICULIER_DEFAULT';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  /** Lit la config active — la crée avec les valeurs par défaut si absente. */
  async getConfig(key: string = DEFAULT_KEY) {
    const existing = await this.prisma.pricingConfig.findUnique({ where: { key } });
    if (existing) return existing;
    return this.prisma.pricingConfig.create({
      data: {
        key,
        label: 'Tarification standard — services particulier',
        percentageBps: 100, // 1,00 %
        flatFeeCents: 10000n, // 100 FCFA
      },
    });
  }

  async updateConfig(key: string, data: { percentageBps?: number; flatFeeCents?: bigint; label?: string }, adminId: string) {
    await this.getConfig(key); // garantit l'existence avant la mise à jour
    return this.prisma.pricingConfig.update({
      where: { key },
      data: { ...data, updatedByAdminId: adminId },
    });
  }

  /**
   * Calcule les frais internes MobilePay (hors part HUB2, lue séparément
   * depuis la réponse HUB2 de chaque transaction) : pourcentage + montant
   * fixe, tous deux paramétrables en back-office.
   */
  async computeOurFee(amount: bigint, key: string = DEFAULT_KEY): Promise<bigint> {
    const config = await this.getConfig(key);
    const percentagePart = (amount * BigInt(config.percentageBps)) / 10000n;
    return percentagePart + config.flatFeeCents;
  }

  /** Total facturé au client : frais HUB2 (dynamiques) + frais internes. */
  async computeTotalFee(amount: bigint, hub2FeeAmount: bigint = 0n, key: string = DEFAULT_KEY): Promise<bigint> {
    const ourFee = await this.computeOurFee(amount, key);
    return hub2FeeAmount + ourFee;
  }
}
