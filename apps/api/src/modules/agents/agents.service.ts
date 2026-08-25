import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  async createAgent(userId: string, zone?: string) {
    return this.prisma.agent.create({ data: { userId, zone } });
  }

  /**
   * Génère un lot de QR pré-imprimés (§14, §21 "créer un lot, générer les QR").
   * Les codes suivent le format MPQR%08d décrit dans le cahier des charges.
   * En production, l'export pour impression (PDF/CSV) serait un job séparé.
   */
  async generateBatch(adminId: string, label: string, quantity: number) {
    if (quantity < 1 || quantity > 10_000) {
      throw new BadRequestException('La quantité doit être comprise entre 1 et 10 000.');
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.qrBatch.create({
        data: { label, quantity, generatedBy: adminId },
      });

      // Insertion en lot pour rester performant même à 10 000 QR.
      const codes = Array.from({ length: quantity }, (_, i) => ({
        code: `MPQR${String(i + 1).padStart(8, '0')}-${batch.id.slice(0, 6)}`,
        type: 'MERCHANT_STATIC' as const,
        status: 'UNASSIGNED' as const,
        batchId: batch.id,
      }));
      await tx.qrCode.createMany({ data: codes });

      return tx.qrBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: { _count: { select: { codes: true } } },
      });
    });
  }

  async assignBatchToAgent(batchId: string, agentId: string) {
    const batch = await this.prisma.qrBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lot introuvable.');

    return this.prisma.$transaction([
      this.prisma.qrBatch.update({ where: { id: batchId }, data: { assignedAgentId: agentId } }),
      this.prisma.qrCode.updateMany({
        where: { batchId },
        data: { status: 'ASSIGNED' },
      }),
    ]);
  }

  /**
   * Linkage QR (§15) : l'agent associe un QR pré-imprimé déjà attribué à un
   * marchand fraîchement créé. Le QR devient ACTIVE seulement après validation
   * du KYC du marchand (voir KycService.review) — ici on se contente du lien.
   */
  async linkQrToMerchant(agentId: string, qrCode: string, merchantId: string) {
    const qr = await this.prisma.qrCode.findUnique({ where: { code: qrCode } });
    if (!qr) throw new NotFoundException('QR introuvable.');
    if (qr.status !== 'ASSIGNED') {
      throw new BadRequestException('Ce QR n\'est pas disponible pour association.');
    }

    return this.prisma.qrCode.update({
      where: { code: qrCode },
      data: { merchantId, status: 'ASSIGNED' }, // passera à ACTIVE lors de l'activation KYC
    });
  }

  async getPerformance(userId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { userId } });
    if (!agent) throw new NotFoundException("Profil agent introuvable pour cet utilisateur.");

    const [merchantsCreated, commissions] = await Promise.all([
      this.prisma.merchant.count({ where: { agentId: agent.id } }),
      this.prisma.commission.aggregate({ where: { agentId: agent.id }, _sum: { amount: true } }),
    ]);
    return { merchantsCreated, totalCommissions: commissions._sum.amount ?? 0n };
  }
}
