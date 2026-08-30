import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto, CreatePaymentRequestDto, TransferFromMerchantDto } from './dto/merchants.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MerchantScopeGuard } from '../../common/guards/merchant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../config/prisma.service';
import { PaymentEngineService } from '../payment-engine/payment-engine.service';
import { NotFoundException } from '@nestjs/common';

@ApiTags('merchants')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantsController {
  constructor(
    private merchantsService: MerchantsService,
    private prisma: PrismaService,
    private paymentEngine: PaymentEngineService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(user.userId, dto);
  }

  /** Marchands auxquels l'utilisateur connecté est rattaché (bootstrap du dashboard marchand). */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.merchantsService.listMineForUser(user.userId);
  }

  // Toutes les routes ci-dessous sont protégées par MerchantScopeGuard :
  // impossible de consulter un marchand auquel on n'est pas rattaché (§9, §32).
  @Get(':merchantId/dashboard')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  getDashboard(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getDashboard(merchantId);
  }

  @Get(':merchantId/wallet')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  getWallet(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getWallet(merchantId);
  }

  /** Transfert depuis le wallet marchand — nécessite l'autorisation admin (Merchant.transfersEnabled). */
  @Post(':merchantId/transfer')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  transferFromMerchant(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferFromMerchantDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.merchantsService.transferFromMerchant(merchantId, user.userId, dto, idempotencyKey);
  }

  /** Vue détaillée pour l'onglet "Wallet" du dashboard marchand (§11). */
  @Get(':merchantId/wallet-detail')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  getWalletDetail(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getWalletDetail(merchantId);
  }

  @Get(':merchantId/transactions')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  getTransactions(
    @Param('merchantId') merchantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.merchantsService.getTransactions(
      merchantId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  /**
   * Demande de paiement (§12 option 4) : le marchand saisit le numéro du client
   * et le montant. Contrairement au QR/Payment Link (débit immédiat consenti par
   * le geste de scan/clic du client), une demande de paiement crée une transaction
   * PENDING + une notification — c'est le CLIENT qui doit ensuite confirmer via
   * POST /transactions/:id/confirm. On ne débite jamais un wallet sans action
   * explicite de son propriétaire.
   */
  @Post(':merchantId/payment-requests')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  async createPaymentRequest(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreatePaymentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const customer = await this.prisma.user.findUnique({ where: { phone: dto.customerPhone } });
    if (!customer) throw new NotFoundException('Aucun compte MobilePay pour ce numéro.');

    const merchantWallet = await this.merchantsService.getWallet(merchantId);
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const transaction = await this.prisma.transaction.create({
      data: {
        type: 'PAYMENT',
        status: 'PENDING',
        amount: BigInt(dto.amount),
        destWalletId: merchantWallet.id,
        initiatedByUserId: customer.id,
        description: dto.description ?? 'Demande de paiement marchand',
        idempotencyKey,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: customer.id,
        channel: 'push',
        title: 'Demande de paiement',
        body: `Un marchand vous demande ${(dto.amount / 100).toLocaleString('fr-FR')} FCFA. Confirmez dans l'app pour payer.`,
      },
    });

    return transaction;
  }
}
