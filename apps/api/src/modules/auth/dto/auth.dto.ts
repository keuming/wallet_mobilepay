import { IsEnum, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsPhoneNumber('CI', { message: 'Numéro de téléphone invalide.' })
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
  @IsPhoneNumber('CI')
  phone: string;

  @IsString()
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
