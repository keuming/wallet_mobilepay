import { IsIn, IsInt, IsOptional, IsPhoneNumber, IsPositive, IsString, MaxLength, Matches, Min, MinLength } from 'class-validator';

export class CreateMerchantDto {
  @IsString()
  @MinLength(2)
  businessName: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class CreatePaymentRequestDto {
  @IsPhoneNumber('CI')
  customerPhone: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class CreateDynamicQrDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  expiresInSeconds?: number; // défaut : 900s (15 min)
}

export class CreatePaymentLinkDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number; // absent = montant libre

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class TransferFromMerchantDto {
  @IsPhoneNumber('CI', { message: 'Numéro du bénéficiaire invalide.' })
  toPhone: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class SellAirtimeDto {
  @IsPhoneNumber('CI', { message: 'Numéro du client invalide.' })
  phoneNumber: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsIn(['AIRTIME', 'DATA'])
  kind: 'AIRTIME' | 'DATA';

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  operatorName?: string;
}

export class RecordCashDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class DebitDirectDto {
  @IsPhoneNumber('CI', { message: 'Numéro du client invalide.' })
  customerPhone: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsIn(['orange', 'mtn', 'moov', 'wave'], { message: 'Opérateur Mobile Money invalide.' })
  provider: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

/** Paiement public (sans connexion) via Mobile Money externe — § pay.mobilepay.ci */
export class PayExternalDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number; // absent si le QR/lien a déjà un montant fixe

  @IsPhoneNumber('CI', { message: 'Numéro invalide.' })
  customerPhone: string;

  @IsIn(['orange', 'mtn', 'moov', 'wave'], { message: 'Opérateur Mobile Money invalide.' })
  provider: string;
}

/** § Hiérarchie distributeur → détaillants (comptes Business). */
export class CreateRetailerDto {
  @IsString()
  @MinLength(2)
  businessName: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsPhoneNumber('CI', { message: 'Numéro invalide.' })
  ownerPhone?: string;

  @IsOptional()
  @IsString()
  ownerFirstName?: string;

  @IsOptional()
  @IsString()
  ownerLastName?: string;

  @IsOptional()
  @Matches(/^\d{4,6}$/, { message: 'Le code PIN doit contenir entre 4 et 6 chiffres.' })
  ownerPin?: string;

  @IsOptional()
  @IsIn(['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], { message: 'Pays non pris en charge.' })
  country?: string;
}

export class RetailerFundDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class RetailerStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}
