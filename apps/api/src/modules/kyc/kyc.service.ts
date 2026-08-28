import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

export interface SubmitKycInput {
  userId?: string;
  merchantId?: string;
  documentType: string;
  documentRef: string;
  attachments?: {
    rectoBase64?: string;
    versoBase64?: string;
    selfieBase64?: string;
    latitude?: number;
    longitude?: number;
  };
}

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  async submit(input: SubmitKycInput) {
    if (!input.userId && !input.merchantId) {
      throw new BadRequestException('Un dossier KYC doit être rattaché à un utilisateur ou un marchand.');
    }
    return this.prisma.kycDossier.create({
      data: {
        userId: input.userId,
        merchantId: input.merchantId,
        documentType: input.documentType,
        documentRef: input.documentRef,
        attachments: input.attachments as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
  }

  /**
   * Revue admin (§18, §19). Sur approbation d'un dossier marchand, le marchand
   * passe ACTIVE et son QR statique est activé — c'est le point d'entrée du
   * flux "Marchand actif" décrit en §15/§38.
   */
  async review(dossierId: string, reviewerAdminId: string, approve: boolean, rejectReason?: string) {
    const dossier = await this.prisma.kycDossier.findUnique({ where: { id: dossierId } });
    if (!dossier) throw new NotFoundException('Dossier KYC introuvable.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.kycDossier.update({
        where: { id: dossierId },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          reviewedBy: reviewerAdminId,
          reviewedAt: new Date(),
          rejectReason: approve ? null : rejectReason,
        },
      });

      if (approve && dossier.userId) {
        await tx.user.update({
          where: { id: dossier.userId },
          data: { kycLevel: 'LEVEL_2' },
        });
      }

      if (approve && dossier.merchantId) {
        await tx.merchant.update({
          where: { id: dossier.merchantId },
          data: { status: 'ACTIVE' },
        });
        await tx.qrCode.updateMany({
          where: { merchantId: dossier.merchantId, type: 'MERCHANT_STATIC' },
          data: { status: 'ACTIVE' },
        });
      }

      return updated;
    });
  }

  async listPending() {
    return this.prisma.kycDossier.findMany({
      where: { status: 'PENDING' },
      include: { user: true, merchant: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
