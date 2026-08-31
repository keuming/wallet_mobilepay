import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { normalizePhoneCI } from '../../common/utils/phone.util';
import { RegisterDto, LoginDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private wallets: WalletsService,
  ) {}

  async register(dto: RegisterDto) {
    const phone = normalizePhoneCI(dto.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec ce numéro de téléphone.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Création du user + de son wallet particulier dans la même transaction :
    // un utilisateur ne doit jamais exister sans wallet associé.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          role: dto.role ?? 'PARTICULIER',
        },
      });

      if (created.role === 'PARTICULIER') {
        await tx.wallet.create({
          data: { type: 'PARTICULIER', userId: created.id, currency: 'XOF' },
        });
      }

      return created;
    });

    return this.issueTokens(user.id, user.role, user.phone);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { phone: normalizePhoneCI(dto.phone) } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('Ce compte a été suspendu. Contactez le support.');
    }

    return this.issueTokens(user.id, user.role, user.phone);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée, veuillez vous reconnecter.');
    }

    // Rotation : on révoque l'ancien refresh token et on en émet un nouveau,
    // ce qui permet de détecter un vol de token (réutilisation d'un token révoqué).
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user.id, stored.user.role, stored.user.phone);
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Déconnexion réussie.' };
  }

  /**
   * Code secret transactionnel (§Menu — "Modifier mon code secret"), distinct
   * du mot de passe de connexion. Première création : nécessite le mot de
   * passe pour confirmer l'identité (pas d'ancien PIN à fournir puisqu'il
   * n'existe pas encore).
   */
  async setInitialPin(userId: string, password: string, pin: string) {
    this.assertValidPinFormat(pin);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.transactionPinHash) {
      throw new BadRequestException(
        'Un code secret existe déjà — utilisez le changement de code plutôt que la création.',
      );
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Mot de passe incorrect.');
    }

    const transactionPinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { transactionPinHash } });
    return { message: 'Code secret créé avec succès.' };
  }

  /** Changement du code secret existant — nécessite l'ancien code. */
  async changePin(userId: string, currentPin: string, newPin: string) {
    this.assertValidPinFormat(newPin);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.transactionPinHash) {
      throw new BadRequestException('Aucun code secret défini — créez-en un d\'abord.');
    }
    if (!(await bcrypt.compare(currentPin, user.transactionPinHash))) {
      throw new UnauthorizedException('Code secret actuel incorrect.');
    }

    const transactionPinHash = await bcrypt.hash(newPin, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { transactionPinHash } });
    return { message: 'Code secret modifié avec succès.' };
  }

  /**
   * Vérifie un code secret sans le modifier — méthode interne destinée à être
   * appelée par les futurs flux de paiement repensés (Envoyer/Payer/etc.)
   * avant d'autoriser un débit. Pas encore branchée à ce stade.
   */
  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.transactionPinHash) return false;
    return bcrypt.compare(pin, user.transactionPinHash);
  }

  async hasPin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return !!user.transactionPinHash;
  }

  private assertValidPinFormat(pin: string) {
    if (!/^\d{4,6}$/.test(pin)) {
      throw new BadRequestException('Le code secret doit contenir entre 4 et 6 chiffres.');
    }
  }

  private async issueTokens(userId: string, role: string, phone: string) {
    const payload = { sub: userId, role, phone };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const expiresInDays = 30;

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 };
  }

  // Les refresh tokens ne sont jamais stockés en clair — seul leur hash SHA-256 l'est.
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
