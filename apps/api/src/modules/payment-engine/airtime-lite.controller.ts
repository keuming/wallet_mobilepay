import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MinLength } from 'class-validator';
import { PaymentEngineService } from './payment-engine.service';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { normalizePhoneStrict } from '../../common/utils/phone.util';

const MAX_TRANSACTION_AMOUNT_CENTS = 50_000_00; // 50 000 FCFA — plafond QR Lite

/** Pays où HUB2 sait collecter un paiement Mobile Money (zones UEMOA/CEMAC). */
const HUB2_COUNTRIES = ['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];

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

  // § Pays du BÉNÉFICIAIRE — Reloadly couvre 190+ pays, quel qu'il soit :
  // on peut acheter du crédit pour n'importe qui, où qu'il vive.
  @IsString()
  recipientCountry: string;

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

  // § Pays du PAYEUR — c'est LUI qui paie en Mobile Money via HUB2, donc
  // forcément l'un des pays qu'HUB2 sait collecter. Distinct du pays du
  // bénéficiaire : on peut très bien payer depuis la Côte d'Ivoire pour
  // recharger un proche au Sénégal, en France ou ailleurs.
  @IsIn(HUB2_COUNTRIES, { message: 'Le paiement Mobile Money doit se faire depuis un pays UEMOA ou CEMAC.' })
  payerCountry: string;
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
    // loin chez l'opérateur. Chaque numéro est normalisé avec SON PROPRE
    // pays — le bénéficiaire et le payeur peuvent vivre dans des pays
    // différents.
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
    });
  }
}
