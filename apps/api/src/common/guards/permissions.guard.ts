import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../config/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Applique les permissions granulaires du back-office (§ administration
 * d'équipe). À utiliser APRÈS JwtAuthGuard et RolesGuard : ce garde suppose
 * que l'utilisateur est déjà authentifié et déjà confirmé comme ADMIN ; il
 * restreint ensuite ce que cet admin précis a le droit de faire.
 *
 * La permission est relue en base à chaque requête (et non depuis le JWT) :
 * un retrait de droits prend ainsi effet immédiatement, sans attendre
 * l'expiration du jeton de la personne concernée.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.userId) throw new ForbiddenException('Authentification requise.');

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { isSuperAdmin: true, adminPermissions: true },
    });
    if (!dbUser) throw new ForbiddenException('Compte introuvable.');

    // Le super-admin garde un accès complet — indispensable pour ne jamais
    // se retrouver verrouillé hors de son propre back-office.
    if (dbUser.isSuperAdmin) return true;

    const granted = dbUser.adminPermissions ?? [];
    const hasAll = required.every((p) => granted.includes(p));
    if (!hasAll) {
      throw new ForbiddenException(
        "Votre profil ne dispose pas de l'autorisation nécessaire pour cette action.",
      );
    }
    return true;
  }
}
