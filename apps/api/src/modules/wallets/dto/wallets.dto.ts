import { IsIn, IsInt, IsOptional, IsPhoneNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class TransferDto {
  @IsPhoneNumber('CI', { message: 'Numéro du bénéficiaire invalide.' })
  toPhone: string;

  @IsInt()
  @IsPositive({ message: 'Le montant doit être positif.' })
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
  amount: number;

  @IsIn(['ORANGE', 'MOOV', 'WAVE', 'MTN'])
  operator: 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

  @IsPhoneNumber('CI', { message: 'Numéro de compte invalide.' })
  accountNumber: string;

  @IsString()
  pin: string;
}
