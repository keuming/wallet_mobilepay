import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { SUPPORTED_COUNTRIES } from '../../../common/utils/phone.util';

export class RegisterDto {
  @IsString()
  @MinLength(6, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole; // par défaut PARTICULIER — MERCHANT_USER/AGENT créés par flux dédiés
}

export class LoginDto {
  // § Le "+" indicatif n'est pas exigé — normalisé côté service avec le
  // pays sélectionné (ou tous les pays supportés en repli).
  @IsString()
  @MinLength(6, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsOptional()
  @IsIn(['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], { message: 'Pays non pris en charge.' })
  country?: string;

  @IsString()
  password: string;
}

/** Étape 2 de la connexion — code de sécurité reçu par SMS (§ 2FA). */
export class VerifyLoginOtpDto extends LoginDto {
  @IsString()
  @MinLength(4, { message: 'Code de connexion invalide.' })
  code: string;
}

/**
 * Inscription simplifiée (§ carte d'accueil après installation) — un seul
 * code PIN sert à la fois de mot de passe de connexion et de code
 * transactionnel, comme Orange Money/MTN MoMo. En interne, les deux champs
 * (passwordHash et transactionPinHash) reçoivent le même hash — n'affecte
 * pas les comptes existants qui ont mot de passe et PIN distincts.
 */
/**
 * Pays couverts par HUB2 (zones UEMOA + CEMAC) — liste partagée pour la
 * validation du champ pays à l'inscription et la création de comptes.
 */

export class RegisterWithPinDto {
  // § Le "+" indicatif n'est pas exigé — normalisé côté service avec le
  // pays choisi à l'inscription.
  @IsString()
  @MinLength(6, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide.' })
  email?: string;

  @IsOptional()
  @IsIn(SUPPORTED_COUNTRIES, { message: 'Pays non pris en charge.' })
  country?: string;

  @Matches(/^\d{4,6}$/, { message: 'Le code PIN doit contenir entre 4 et 6 chiffres.' })
  pin: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
