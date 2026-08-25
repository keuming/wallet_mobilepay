import { IsInt, IsOptional, IsPhoneNumber, IsPositive, IsString, MaxLength, Min, MinLength } from 'class-validator';

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
  @IsPhoneNumber(undefined)
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
