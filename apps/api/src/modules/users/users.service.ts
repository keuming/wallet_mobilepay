import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        kycLevel: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return user;
  }

  /**
   * Mise à jour du profil (§Menu — Profil avec CRUD). Le téléphone n'est
   * jamais modifiable ici : c'est l'identifiant de connexion, un changement
   * nécessiterait un flux de vérification dédié (hors périmètre MVP).
   */
  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; email?: string }) {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
      },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        kycLevel: true,
        createdAt: true,
      },
    });
    return updated;
  }
}
