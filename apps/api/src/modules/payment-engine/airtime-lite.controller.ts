import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { assertIdempotencyKey } from '../../common/utils/idempotency.util';
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

  // § Orange uniquement : code généré via #144*82#, transmis EN AMONT
  // (voir commentaire sur purchaseAirtimeLite). Absent pour les autres
  // opérateurs, qui authentifient directement sur le téléphone du payeur.
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

  /** Catalogue public — mêmes données que /airtime/operators, sans le jeton exigé là-bas. */
  @Get('operators')
  async listOperators(@Query('country') country: string = 'CI') {
    return this.reloadly.listOperatorsForCountry(country);
  }

  /**
   * § Suivi PUBLIC d'une transaction QR Lite — sans ce doublon,
   * la page /lite interrogeait GET /transactions/:id, qui exige un jeton
   * (aucun compte sur ce parcours). Chaque appel échouait en 401,
   * silencieusement absorbé côté client : l'écran restait figé sur le
   * formulaire même après un paiement Wave réellement réussi.
   *
   * On expose ici UNIQUEMENT ce qui sert à l'affichage (statut, action
   * requise, raison d'échec) — jamais les écritures comptables ni les
   * détails internes que renvoie l'endpoint authentifié.
   */
  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    await this.paymentEngine.refreshFromProvider(id).catch(() => null);

    const transaction = await this.paymentEngine.findLiteTransactionPublic(id);
    if (!transaction) throw new NotFoundException('Transaction introuvable.');
    return transaction;
  }

  @Post()
  async purchase(
    @Body() dto: PurchaseAirtimeLiteDto,
    @Headers('idempotency-key') idempotencyKeyHeader: string,
  ) {
    // § Défense en profondeur : le middleware exige déjà cet en-tête (voir
    // app.module.ts), mais l'ancien service générait SA PROPRE clé
    // aléatoire à chaque appel plutôt que de réutiliser celle-ci — un rejeu
    // réseau ou un double-clic sur "Confirmer" créait donc systématiquement
    // une SECONDE transaction et un second débit réel, malgré l'en-tête
    // présent. Corrigé : la clé du client est désormais celle qui compte.
    const idempotencyKey = assertIdempotencyKey(idempotencyKeyHeader);

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
      otpCode: dto.otpCode,
      idempotencyKey,
    });
  }
}
