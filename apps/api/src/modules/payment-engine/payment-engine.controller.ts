import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPhoneNumber, IsPositive, IsString } from 'class-validator';
import { PaymentEngineService } from './payment-engine.service';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { TopupDto } from '../wallets/dto/wallets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class PurchaseAirtimeDto {
  @IsPhoneNumber('CI', { message: 'Numéro à recharger invalide.' })
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
  cardId?: string; // requis si paymentMethod === 'CARD'
}

export class SendExternalDto {
  @IsEnum(['ORANGE', 'MOOV', 'WAVE', 'MTN'])
  operator: 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

  @IsPhoneNumber('CI', { message: 'Numéro de compte destinataire invalide.' })
  accountNumber: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  pin: string;
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
      { operator: dto.operator, accountNumber: dto.accountNumber, amount: BigInt(dto.amount), pin: dto.pin },
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
  listOperators(@Query('phone') phone?: string) {
    if (phone) {
      const operator = this.reloadly.detectOperator(phone);
      return operator ? [operator] : this.reloadly.listKnownOperators();
    }
    return this.reloadly.listKnownOperators();
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
      },
      idempotencyKey,
    );
  }
}
