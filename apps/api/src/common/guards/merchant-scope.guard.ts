import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// Règle fondamentale du cahier des charges (§9, §32) :
// "Aucun utilisateur marchand ne peut accéder aux données d'un autre marchand."
// Ce guard vérifie que le user JWT courant est bien rattaché (MerchantUser) au
// `merchantId` présent dans l'URL, AVANT que le controller n'exécute quoi que ce soit.
@Injectable()
export class MerchantScopeGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const merchantId = request.params.merchantId;

    if (!user || !merchantId) return false;

    // Un admin plateforme peut consulter tous les marchands.
    if (user.role === 'ADMIN') return true;

    const link = await this.prisma.merchantUser.findUnique({
      where: { merchantId_userId: { merchantId, userId: user.userId } },
    });

    if (!link) {
      throw new ForbiddenException(
        "Vous n'êtes pas rattaché à ce marchand.",
      );
    }

    // Le rôle interne (Cashier, Accountant, Manager, Admin) est attaché à la requête
    // pour que les controllers puissent affiner les permissions si besoin.
    request.merchantRole = link.role;
    return true;
  }
}
