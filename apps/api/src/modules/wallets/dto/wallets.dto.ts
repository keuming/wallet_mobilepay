import { IsInt, IsOptional, IsPhoneNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class TransferDto {
  @IsPhoneNumber(undefined, { message: 'Numéro du bénéficiaire invalide.' })
  toPhone: string;

  @IsInt()
  @IsPositive({ message: 'Le montant doit être positif.' })
  amount: number; // en centimes — ex: 500000 = 5 000 FCFA

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}

export class TopupDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  providerName: 'HUB2'; // seul HUB2 est branché au MVP
}
