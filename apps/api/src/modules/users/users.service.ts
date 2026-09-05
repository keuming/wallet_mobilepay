import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
        country: true,
        profilePhotoBase64: true,
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
        country: true,
        profilePhotoBase64: true,
        createdAt: true,
      },
    });
    return updated;
  }

  /**
   * Met à jour la photo de profil (§ affichée à la place de l'initiale sur
   * l'accueil et dans le menu). Garde-fou de taille : au-delà de ~2 Mo de
   * base64 (≈ 1,5 Mo d'image réelle), on refuse plutôt que de laisser la
   * base de données grossir sans contrôle — largement suffisant pour une
   * photo de profil, qui devrait de toute façon être compressée côté client.
   */
  async updatePhoto(userId: string, photoBase64: string | null) {
    if (photoBase64 && photoBase64.length > 2_000_000) {
      throw new BadRequestException('Image trop volumineuse (2 Mo maximum).');
    }
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.prisma.user.update({
      where: { id: userId },
      data: { profilePhotoBase64: photoBase64 },
      select: { id: true, profilePhotoBase64: true },
    });
  }
}
