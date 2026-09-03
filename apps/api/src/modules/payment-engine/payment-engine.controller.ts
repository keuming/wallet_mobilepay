import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { PaymentEngineService } from './payment-engine.service';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { TopupDto } from '../wallets/dto/wallets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class PurchaseAirtimeDto {
  // § Le "+" indicatif n'est pas exigé — normalisé côté service avec le
  // pays du destinataire (countryCode) ou celui de l'acheteur par défaut.
  @IsString()
  @MinLength(6, { message: 'Numéro à recharger invalide.' })
  phoneNumber: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsEnum(['AIRTIME', 'DATA'])
  kind: 'AIRTIME' | 'DATA';

  @IsEnum(['WALLET', 'MOBILE_MONEY', 'CARD'])
  paymentMethod: 'WALLET' | 'MOBILE_MONEY' | 'CARD';

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  momoProvider?: string; // opérateur du PAYEUR (Mobile Money) — distinct d'operatorId (opérateur du destinataire)

  @IsOptional()
  @IsString()
  cardId?: string; // requis si paymentMethod === 'CARD'

  @IsOptional()
  @IsIn(['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], { message: 'Pays non pris en charge.' })
  countryCode?: string; // pays du DESTINATAIRE du crédit — défaut le pays de l'acheteur si absent
}

export class SendExternalDto {
  @IsEnum(['ORANGE', 'MOOV', 'WAVE', 'MTN'])
  operator: 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

  // § Le "+" indicatif n'est pas exigé — normalisé côté service avec le
  // pays choisi (ou celui de l'expéditeur par défaut).
  @IsString()
  @MinLength(6, { message: 'Numéro de compte destinataire invalide.' })
  accountNumber: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  pin: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsIn(['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], { message: 'Pays non pris en charge.' })
  country?: string;
}

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class PaymentEngineController {
  constructor(private paymentEngine: PaymentEngineService) {}

  @Post('topup')
  topup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TopupDto,
    @Headers('idempotency-key') _idempotencyKey: string,
  ) {
    // La clé d'idempotence est déjà vérifiée par IdempotencyMiddleware ; la
    // référence provider (générée dans le service) sert d'idempotence côté HUB2.
    return this.paymentEngine.initiateTopup(user.userId, {
      operator: dto.operator,
      accountNumber: dto.accountNumber,
      amount: BigInt(dto.amount),
      pin: dto.pin,
    });
  }

  /**
   * Envoi vers une destination externe au wallet MobilePay (§ parcours Envoyer
   * repensé) — Mobile Money d'un autre opérateur, via HUB2. Le code secret
   * transactionnel est obligatoire pour toute sortie de fonds externe.
   */
  @Post('send-external')
  sendExternal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendExternalDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.paymentEngine.sendToExternalAccount(
      user.userId,
      { operator: dto.operator, accountNumber: dto.accountNumber, amount: BigInt(dto.amount), pin: dto.pin, recipientName: dto.recipientName, country: dto.country },
      idempotencyKey,
    );
  }
}

// Endpoint séparé pour respecter le chemin du cahier des charges (§33: POST /api/airtime)
@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('airtime')
export class AirtimeController {
  constructor(
    private paymentEngine: PaymentEngineService,
    private reloadly: ReloadlyAdapter,
  ) {}

  @Get('operators')
  async listOperators(@Query('phone') phone?: string, @Query('country') country: string = 'CI') {
    if (phone) {
      const operator = await this.reloadly.detectOperator(phone, country);
      return operator ? [operator] : this.reloadly.listOperatorsForCountry(country);
    }
    return this.reloadly.listOperatorsForCountry(country);
  }

  @Post()
  purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseAirtimeDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.paymentEngine.purchaseAirtime(
      user.userId,
      {
        phoneNumber: dto.phoneNumber,
        operatorId: dto.operatorId,
        amount: BigInt(dto.amount),
        kind: dto.kind,
        paymentMethod: dto.paymentMethod,
        cardId: dto.cardId,
        momoProvider: dto.momoProvider,
        countryCode: dto.countryCode,
      },
      idempotencyKey,
    );
  }
}

export class PurchaseGiftCardDto {
  @IsInt()
  @IsPositive()
  productId: number;

  @IsPositive()
  unitPrice: number;

  @IsEmail({}, { message: 'Adresse email du bénéficiaire invalide.' })
  recipientEmail: string;

  @IsString()
  pin: string;
}

@ApiTags('gift-cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gift-cards')
export class GiftCardsController {
  constructor(private paymentEngine: PaymentEngineService) {}

  @Get('products')
  listProducts(@Query('country') country: string = 'CI') {
    return this.paymentEngine.listGiftCardProducts(country);
  }

  @Post('orders')
  purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseGiftCardDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.paymentEngine.purchaseGiftCard(
      user.userId,
      { productId: dto.productId, unitPrice: dto.unitPrice, recipientEmail: dto.recipientEmail, pin: dto.pin },
      idempotencyKey,
    );
  }
}
