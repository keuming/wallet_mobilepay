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
import { SmsAdapter } from '../sms/sms.adapter';
import { normalizePhoneCI } from '../../common/utils/phone.util';
import { RegisterDto, LoginDto, RegisterWithPinDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private wallets: WalletsService,
    private sms: SmsAdapter,
  ) {}

  /**
   * Envoie un code OTP au numéro fourni (§ inscription — vérifie que le
   * numéro est bien saisi correctement et joignable, avant de créer le
   * compte). Limite à un envoi par minute pour éviter le spam.
   */
  async sendPhoneOtp(phoneRaw: string, country?: string) {
    const phone = normalizePhoneCI(phoneRaw, (country as any) ?? 'CI');

    const recent = await this.prisma.phoneVerification.findFirst({
      where: { phone, purpose: 'REGISTRATION', createdAt: { gte: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('Un code a déjà été envoyé récemment — patiente une minute avant de réessayer.');
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec ce numéro de téléphone.');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    await this.prisma.phoneVerification.create({
      data: {
        phone,
        codeHash,
        purpose: 'REGISTRATION',
        expiresAt: new Date(Date.now() + 10 * 60_000), // 10 minutes
      },
    });

    const result = await this.sms.send(phone, `MobilePay CI : votre code de vérification est ${code}. Valable 10 minutes.`);
    if (!result.success) {
      throw new BadRequestException(result.errorReason ?? "Échec de l'envoi du code.");
    }
    return { sent: true };
  }

  /**
   * Vérifie le code OTP saisi. Ne crée pas encore le compte — marque juste
   * ce numéro comme vérifié, pour un temps limité, avant l'inscription
   * effective (§ registerWithPin exige cette vérification récente).
   */
  async verifyPhoneOtp(phoneRaw: string, code: string, country?: string) {
    const phone = normalizePhoneCI(phoneRaw, (country as any) ?? 'CI');
    const verification = await this.prisma.phoneVerification.findFirst({
      where: { phone, purpose: 'REGISTRATION', verified: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException('Code expiré ou introuvable — demande un nouveau code.');
    }
    if (verification.attempts >= 5) {
      throw new BadRequestException('Trop de tentatives — demande un nouveau code.');
    }

    const matches = await bcrypt.compare(code, verification.codeHash);
    if (!matches) {
      await this.prisma.phoneVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Code incorrect.');
    }

    await this.prisma.phoneVerification.update({ where: { id: verification.id }, data: { verified: true } });
    return { verified: true };
  }

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

  /**
   * Inscription simplifiée avec PIN unique (§ carte d'accueil après
   * installation) — le même code sert de mot de passe de connexion ET de
   * code transactionnel. N'affecte pas les comptes créés via `register`
   * (mot de passe et PIN restent indépendants pour eux).
   */
  async registerWithPin(dto: RegisterWithPinDto) {
    const phone = normalizePhoneCI(dto.phone, (dto.country as any) ?? 'CI');
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec ce numéro de téléphone.');
    }
    if (dto.email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailTaken) throw new ConflictException('Cette adresse email est déjà utilisée.');
    }

    // Le numéro doit avoir été vérifié par OTP dans les 30 dernières minutes
    // — évite les comptes créés avec un numéro mal saisi, ensuite injoignable.
    const verification = await this.prisma.phoneVerification.findFirst({
      where: {
        phone,
        purpose: 'REGISTRATION',
        verified: true,
        createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException('Numéro non vérifié — merci de vérifier ton numéro par code avant de continuer.');
    }

    const pinHash = await bcrypt.hash(dto.pin, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          country: dto.country ?? 'CI',
          passwordHash: pinHash,
          transactionPinHash: pinHash,
          role: 'PARTICULIER',
        },
      });

      await tx.wallet.create({
        data: { type: 'PARTICULIER', userId: created.id, currency: 'XOF' },
      });

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

  /**
   * Réinitialise le code secret en cas d'oubli (§ contrairement à changePin,
   * ne nécessite PAS l'ancien code — vérifie le mot de passe de connexion à
   * la place, que l'utilisateur connaît forcément puisqu'il est authentifié).
   */
  async resetPin(userId: string, password: string, newPin: string) {
    this.assertValidPinFormat(newPin);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Mot de passe incorrect.');
    }

    const transactionPinHash = await bcrypt.hash(newPin, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { transactionPinHash } });
    return { message: 'Code secret réinitialisé avec succès.' };
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
