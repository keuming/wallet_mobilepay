import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength, Max } from 'class-validator';
import { MAX_TRANSACTION_AMOUNT_CENTS } from '../../../common/constants/limits';

export class TransferDto {
  // § Le "+" indicatif n'est pas exigé ici — le service essaie tous les
  // pays supportés (normalizePhoneCandidates) pour retrouver le compte,
  // que le pays soit précisé ou non par l'utilisateur.
  @IsString()
  @MinLength(6, { message: 'Numéro du bénéficiaire invalide.' })
  toPhone: string;

  @IsInt()
  @IsPositive({ message: 'Le montant doit être positif.' })
  @Max(MAX_TRANSACTION_AMOUNT_CENTS, { message: 'Montant trop élevé.' })
  amount: number; // en centimes — ex: 500000 = 5 000 FCFA

  @IsString()
  pin: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class TopupDto {
  @IsInt()
  @IsPositive()
  @Max(MAX_TRANSACTION_AMOUNT_CENTS, { message: 'Montant trop élevé.' })
  amount: number;

  @IsIn(['ORANGE', 'MOOV', 'WAVE', 'MTN'])
  operator: 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

  // § Numéro Mobile Money du titulaire lui-même — le service normalise
  // avec son pays enregistré, le "+" n'est donc pas exigé à la saisie.
  @IsString()
  @MinLength(6, { message: 'Numéro de compte invalide.' })
  accountNumber: string;

  @IsString()
  pin: string;
}
