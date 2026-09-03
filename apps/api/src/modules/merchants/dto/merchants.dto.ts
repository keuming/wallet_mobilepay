import { IsEmail, IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, Matches, Min, MinLength } from 'class-validator';

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
  @IsString()
  @MinLength(6, { message: 'Numéro invalide.' })
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
  @IsString()
  @MinLength(6, { message: 'Numéro du bénéficiaire invalide.' })
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
  // § Le "+" indicatif n'est pas exigé — Reloadly reçoit le numéro local et
  // le pays séparément (countryCode du marchand), pas besoin de format E.164.
  @IsString()
  @MinLength(6, { message: 'Numéro du client invalide.' })
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

  // § Pays du DESTINATAIRE du crédit — peut différer du pays du marchand
  // (ex: recharger un proche dans un autre pays). Défaut : pays du marchand.
  @IsOptional()
  @IsIn(['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], { message: 'Pays non pris en charge.' })
  countryCode?: string;
}

export class BuyGiftCardDto {
  @IsInt()
  @IsPositive()
  productId: number;

  @IsPositive()
  unitPrice: number;

  @IsEmail({}, { message: 'Adresse email du bénéficiaire invalide.' })
  recipientEmail: string;

  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class PayUtilityBillDto {
  @IsInt()
  @IsPositive()
  billerId: number;

  @IsString()
  billerName: string;

  @IsIn(['ELECTRICITY_BILL_PAYMENT', 'WATER_BILL_PAYMENT', 'TV_BILL_PAYMENT', 'INTERNET_BILL_PAYMENT'])
  billType: string;

  @IsString()
  @MinLength(1, { message: 'Numéro de compte/compteur requis.' })
  subscriberAccountNumber: string;

  @IsPositive()
  amount: number;
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
  @IsString()
  @MinLength(6, { message: 'Numéro du client invalide.' })
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

/** Paiement public (sans connexion) via Mobile Money externe — § pay.mobilepay-ci.com */
export class PayExternalDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number; // absent si le QR/lien a déjà un montant fixe

  @IsString()
  @MinLength(6, { message: 'Numéro invalide.' })
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
  @IsString()
  @MinLength(6, { message: 'Numéro invalide.' })
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
