import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// § Corrige la faille critique constatée à l'audit sécurité : aucune limite
// de tentatives sur le code secret ni le mot de passe de connexion,
// combinée à une limite de débit globale bien trop permissive (120
// req/min/IP) pour empêcher une force brute sur un code à 4 chiffres
// (10 000 combinaisons épuisables en moins de 90 minutes sans ce verrou).
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class LockoutService {
  constructor(private prisma: PrismaService) {}

  /** À appeler AVANT toute vérification de code secret/mot de passe — bloque
   * immédiatement si le compte est actuellement verrouillé. */
  async assertNotLocked(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.securityLockedUntil && user.securityLockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.securityLockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(
        `Trop de tentatives incorrectes. Réessayez dans ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
      );
    }
  }

  /** À appeler après un échec de vérification — incrémente le compteur et
   * verrouille le compte si le seuil est atteint. */
  async recordFailure(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { securityFailedAttempts: { increment: 1 } },
    });
    if (user.securityFailedAttempts >= MAX_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { securityLockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000), securityFailedAttempts: 0 },
      });
      throw new UnauthorizedException(
        `Trop de tentatives incorrectes. Compte temporairement verrouillé ${LOCKOUT_MINUTES} minutes.`,
      );
    }
  }

  /** À appeler après une vérification réussie — remet le compteur à zéro. */
  async recordSuccess(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { securityFailedAttempts: 0, securityLockedUntil: null },
    });
  }
}
