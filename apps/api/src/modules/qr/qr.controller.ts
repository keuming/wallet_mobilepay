import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QrService } from './qr.service';
import { CreateDynamicQrDto, CreatePaymentLinkDto, PayExternalDto } from '../merchants/dto/merchants.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MerchantScopeGuard } from '../../common/guards/merchant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('qr')
@ApiBearerAuth()
@Controller()
export class QrController {
  constructor(private qrService: QrService) {}

  // --- Particulier ---
  @Get('users/me/qr')
  @UseGuards(JwtAuthGuard)
  getMyQr(@CurrentUser() user: AuthenticatedUser) {
    return this.qrService.getOrCreatePersonalQr(user.userId);
  }

  // --- Marchand (scoped) ---
  @Get('merchants/:merchantId/qr/static')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  getMerchantStaticQr(@Param('merchantId') merchantId: string) {
    return this.qrService.getMerchantStaticQr(merchantId);
  }

  @Get('merchants/:merchantId/qr')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  listMerchantQr(@Param('merchantId') merchantId: string) {
    return this.qrService.listMerchantQr(merchantId);
  }

  @Get('merchants/:merchantId/payment-links')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  listPaymentLinks(@Param('merchantId') merchantId: string) {
    return this.qrService.listPaymentLinks(merchantId);
  }

  @Post('merchants/:merchantId/qr/dynamic')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  createDynamicQr(@Param('merchantId') merchantId: string, @Body() dto: CreateDynamicQrDto) {
    return this.qrService.createDynamicQr(merchantId, dto);
  }

  @Post('merchants/:merchantId/payment-links')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  createPaymentLink(@Param('merchantId') merchantId: string, @Body() dto: CreatePaymentLinkDto) {
    return this.qrService.createPaymentLink(merchantId, dto);
  }

  // --- Résolution publique (avant authentification du payeur côté app) ---
  @Get('qr/:code')
  resolveQr(@Param('code') code: string) {
    return this.qrService.resolveQr(code);
  }

  @Get('payment-links/:slug')
  resolvePaymentLink(@Param('slug') slug: string) {
    return this.qrService.resolvePaymentLink(slug);
  }

  // --- Paiement (le payeur doit être authentifié) ---
  @Post('qr/:code/pay')
  @UseGuards(JwtAuthGuard)
  payQr(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body('amount') amount: number | undefined,
    @Body('fundingSource') fundingSource: 'WALLET' | 'MOBILE_MONEY',
    @Body('pin') pin: string,
    @Body('customerPhone') customerPhone: string | undefined,
    @Body('provider') provider: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.qrService.payQr(user.userId, code, amount, fundingSource, pin, idempotencyKey, customerPhone, provider);
  }

  @Post('payment-links/:slug/pay')
  @UseGuards(JwtAuthGuard)
  payPaymentLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body('amount') amount: number | undefined,
    @Body('fundingSource') fundingSource: 'WALLET' | 'MOBILE_MONEY',
    @Body('pin') pin: string,
    @Body('customerPhone') customerPhone: string | undefined,
    @Body('provider') provider: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.qrService.payPaymentLink(user.userId, slug, amount, fundingSource, pin, idempotencyKey, customerPhone, provider);
  }

  // --- Paiement PUBLIC, sans connexion (§ pay.mobilepay-ci.com) — client sans
  // compte MobilePay, via Mobile Money externe uniquement. ---
  @Post('qr/:code/pay-external')
  payQrExternal(
    @Param('code') code: string,
    @Body() dto: PayExternalDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.qrService.payQrExternal(code, dto.amount, dto.customerPhone, dto.provider, idempotencyKey);
  }

  @Post('payment-links/:slug/pay-external')
  payPaymentLinkExternal(
    @Param('slug') slug: string,
    @Body() dto: PayExternalDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.qrService.payPaymentLinkExternal(slug, dto.amount, dto.customerPhone, dto.provider, idempotencyKey);
  }
}
