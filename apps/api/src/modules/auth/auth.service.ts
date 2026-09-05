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
import { normalizePhoneCI, normalizePhoneCandidates } from '../../common/utils/phone.util';
import { LockoutService } from '../security/lockout.service';
import { RegisterDto, LoginDto, RegisterWithPinDto, VerifyLoginOtpDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private wallets: WalletsService,
    private sms: SmsAdapter,
    private lockout: LockoutService,
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
    // § Le numéro peut être saisi en format local sans indicatif — si le
    // pays est fourni (sélectionné à l'écran de connexion), on l'essaie en
    // priorité pour une résolution précise ; sinon on retente chaque pays
    // supporté, comme avant.
    const candidates = dto.country
      ? [normalizePhoneCI(dto.phone, dto.country as any), ...normalizePhoneCandidates(dto.phone)]
      : normalizePhoneCandidates(dto.phone);
    const user = await this.prisma.user.findFirst({ where: { phone: { in: candidates } } });
    if (user) await this.lockout.assertNotLocked(user.id);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      if (user) await this.lockout.recordFailure(user.id);
      throw new UnauthorizedException('Identifiants invalides.');
    }
    await this.lockout.recordSuccess(user.id);
    if (user.isBlocked) {
      throw new UnauthorizedException('Ce compte a été suspendu. Contactez le support.');
    }

    // § Le pays sélectionné à la connexion reflète la résidence actuelle du
    // titulaire — on le fixe comme pays d'utilisation de l'application s'il
    // diffère de celui enregistré.
    if (dto.country && dto.country !== user.country) {
      await this.prisma.user.update({ where: { id: user.id }, data: { country: dto.country } });
    }

    // § Sécurité critique — confirme que la personne qui se connecte détient
    // bien le téléphone associé au compte, pas seulement le mot de passe.
    // Empêche un voleur du smartphone (ou un mot de passe compromis) d'accéder
    // au compte sans avoir aussi le SIM/téléphone en main pour recevoir le code.
    //
    // § SUSPENDU TEMPORAIREMENT (panne du fournisseur SMS, compte non
    // crédité) — piloté par la variable d'environnement SKIP_LOGIN_OTP.
    // Dès que le service SMS est rétabli, retirer (ou passer à "false")
    // cette variable sur Render pour réactiver la vérification — AUCUN
    // redéploiement de code n'est nécessaire pour ce va-et-vient.
    if (this.config.get('SKIP_LOGIN_OTP') === 'true') {
      const tokens = await this.issueTokens(user.id, user.role, user.phone);
      return { ...tokens, requiresOtp: false };
    }

    const recentOtp = await this.prisma.phoneVerification.findFirst({
      where: { phone: user.phone, purpose: 'LOGIN_2FA', createdAt: { gte: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (!recentOtp) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const codeHash = await bcrypt.hash(code, 10);
      await this.prisma.phoneVerification.create({
        data: { phone: user.phone, codeHash, purpose: 'LOGIN_2FA', expiresAt: new Date(Date.now() + 10 * 60_000) },
      });
      // § Le résultat était ignoré — l'utilisateur recevait "requiresOtp:
      // true" (donc l'écran de saisie du code) même quand le SMS avait
      // réellement échoué à partir, le laissant bloqué sans code à saisir.
      const smsResult = await this.sms.send(user.phone, `MobilePay CI : ton code de connexion est ${code}. Ne le partage avec personne.`);
      if (!smsResult.success) {
        throw new BadRequestException(
          "Impossible d'envoyer le code de connexion pour le moment. Réessaie dans quelques instants.",
        );
      }
    }

    // § Numéro masqué — évite d'exposer le numéro complet avant confirmation.
    const maskedPhone = user.phone.replace(/(\+\d{3,5})\d+(\d{2})$/, '$1••••••$2');
    return { requiresOtp: true, maskedPhone };
  }

  /** Confirme le code de connexion reçu par SMS, puis émet les jetons. */
  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const candidates = dto.country
      ? [normalizePhoneCI(dto.phone, dto.country as any), ...normalizePhoneCandidates(dto.phone)]
      : normalizePhoneCandidates(dto.phone);
    const user = await this.prisma.user.findFirst({ where: { phone: { in: candidates } } });
    if (user) await this.lockout.assertNotLocked(user.id);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      if (user) await this.lockout.recordFailure(user.id);
      throw new UnauthorizedException('Identifiants invalides.');
    }
    await this.lockout.recordSuccess(user.id);
    if (user.isBlocked) {
      throw new UnauthorizedException('Ce compte a été suspendu. Contactez le support.');
    }

    const verification = await this.prisma.phoneVerification.findFirst({
      where: { phone: user.phone, purpose: 'LOGIN_2FA', expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification || !(await bcrypt.compare(dto.code, verification.codeHash))) {
      throw new UnauthorizedException('Code de connexion invalide ou expiré.');
    }
    await this.prisma.phoneVerification.delete({ where: { id: verification.id } });

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
