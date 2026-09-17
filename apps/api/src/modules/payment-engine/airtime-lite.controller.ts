import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MinLength } from 'class-validator';
import { PaymentEngineService } from './payment-engine.service';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { normalizePhoneStrict } from '../../common/utils/phone.util';

const MAX_TRANSACTION_AMOUNT_CENTS = 50_000_00; // 50 000 FCFA — plafond QR Lite

/**
 * § Endpoint DÉLIBÉRÉMENT public : c'est tout le sens du "QR Lite" —
 * scanner un code depuis le site vitrine et acheter du crédit SANS jamais
 * créer de compte ORZAYAH. Aucun JwtAuthGuard ici, contrairement au
 * contrôleur /airtime standard qui, lui, protège même la consultation du
 * catalogue.
 *
 * La sécurité tient ailleurs : c'est TOUJOURS l'opérateur Mobile Money qui
 * authentifie le débit (code Orange, USSD MTN/Moov, lien Wave) — jamais
 * nous. Un plafond bas limite l'exposition d'un éventuel abus, et le
 * rate-limiting global (ThrottlerGuard) s'applique comme partout ailleurs.
 */
export class PurchaseAirtimeLiteDto {
  @IsString()
  @MinLength(6, { message: 'Numéro du bénéficiaire invalide.' })
  phoneNumber: string;

  @IsInt()
  @IsPositive()
  @Max(MAX_TRANSACTION_AMOUNT_CENTS, { message: 'Montant trop élevé pour un achat sans compte.' })
  amount: number;

  @IsIn(['AIRTIME', 'DATA'])
  kind: 'AIRTIME' | 'DATA';

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsIn(['ORANGE', 'MTN', 'MOOV', 'WAVE'])
  momoProvider: string;

  @IsString()
  @MinLength(6, { message: 'Numéro du payeur invalide.' })
  payerPhone: string;

  @IsString()
  countryCode: string;
}

@Controller('airtime-lite')
export class AirtimeLiteController {
  constructor(
    private paymentEngine: PaymentEngineService,
    private reloadly: ReloadlyAdapter,
  ) {}

  /** Catalogue public — mêmes données que /airtime/operators, sans le jeton exigé là-bas. */
  @Get('operators')
  async listOperators(@Query('country') country: string = 'CI') {
    return this.reloadly.listOperatorsForCountry(country);
  }

  @Post()
  async purchase(@Body() dto: PurchaseAirtimeLiteDto) {
    // La normalisation STRICTE rejette un numéro réellement invalide avec un
    // message clair, plutôt que de le laisser échouer silencieusement plus
    // loin chez l'opérateur.
    const phoneNumber = normalizePhoneStrict(dto.phoneNumber, dto.countryCode as any);
    const payerPhone = normalizePhoneStrict(dto.payerPhone, dto.countryCode as any);

    return this.paymentEngine.purchaseAirtimeLite({
      phoneNumber,
      amount: BigInt(dto.amount),
      kind: dto.kind,
      operatorId: dto.operatorId,
      momoProvider: dto.momoProvider,
      payerPhone,
      countryCode: dto.countryCode,
    });
  }
}
