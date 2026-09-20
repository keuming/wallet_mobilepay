import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MinLength } from 'class-validator';
import { PaymentEngineService } from './payment-engine.service';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { normalizePhoneStrict } from '../../common/utils/phone.util';

const MAX_TRANSACTION_AMOUNT_CENTS = 50_000_00; // 50 000 FCFA - plafond QR Lite

// Pays ou HUB2 sait collecter un paiement Mobile Money (zones UEMOA/CEMAC).
const HUB2_COUNTRIES = ['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];

// Endpoint DELIBEREMENT public : achat de credit sans compte ORZAYAH.
// La securite tient au fait que c'est TOUJOURS l'operateur Mobile Money
// qui authentifie le debit - jamais nous.
export class PurchaseAirtimeLiteDto {
  @IsString()
  @MinLength(6, { message: 'Numero du beneficiaire invalide.' })
  phoneNumber: string;

  @IsString()
  recipientCountry: string;

  @IsInt()
  @IsPositive()
  @Max(MAX_TRANSACTION_AMOUNT_CENTS, { message: 'Montant trop eleve pour un achat sans compte.' })
  amount: number;

  @IsIn(['AIRTIME', 'DATA'])
  kind: 'AIRTIME' | 'DATA';

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsIn(['ORANGE', 'MTN', 'MOOV', 'WAVE'])
  momoProvider: string;

  @IsString()
  @MinLength(6, { message: 'Numero du payeur invalide.' })
  payerPhone: string;

  @IsIn(HUB2_COUNTRIES, { message: 'Le paiement Mobile Money doit se faire depuis un pays UEMOA ou CEMAC.' })
  payerCountry: string;

  // Orange uniquement : code genere via #144*82#, transmis EN AMONT.
  @IsOptional()
  @IsString()
  otpCode?: string;
}

@Controller('airtime-lite')
export class AirtimeLiteController {
  constructor(
    private paymentEngine: PaymentEngineService,
    private reloadly: ReloadlyAdapter,
  ) {}

  @Get('operators')
  async listOperators(@Query('country') country: string = 'CI') {
    return this.reloadly.listOperatorsForCountry(country);
  }

  @Post()
  async purchase(@Body() dto: PurchaseAirtimeLiteDto) {
    const phoneNumber = normalizePhoneStrict(dto.phoneNumber, dto.recipientCountry as any);
    const payerPhone = normalizePhoneStrict(dto.payerPhone, dto.payerCountry as any);

    return this.paymentEngine.purchaseAirtimeLite({
      phoneNumber,
      amount: BigInt(dto.amount),
      kind: dto.kind,
      operatorId: dto.operatorId,
      momoProvider: dto.momoProvider,
      payerPhone,
      recipientCountry: dto.recipientCountry,
      payerCountry: dto.payerCountry,
      otpCode: dto.otpCode,
    });
  }
}