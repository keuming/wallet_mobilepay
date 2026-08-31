import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto, CreatePaymentRequestDto, TransferFromMerchantDto, SellAirtimeDto, RecordCashDto, DebitDirectDto } from './dto/merchants.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MerchantScopeGuard } from '../../common/guards/merchant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../config/prisma.service';
import { PaymentEngineService } from '../payment-engine/payment-engine.service';
import { normalizePhoneCI } from '../../common/utils/phone.util';
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

  /** Vente de crédit d'appel/data à un client, financée par le wallet marchand. */
  @Post(':merchantId/airtime')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  sellAirtime(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SellAirtimeDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.merchantsService.sellAirtime(merchantId, user.userId, dto, idempotencyKey);
  }

  /** Encaissement en espèces — pur journal de caisse, aucun mouvement de wallet. */
  @Post(':merchantId/cash')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  recordCash(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordCashDto,
  ) {
    return this.merchantsService.recordCashCollection(merchantId, user.userId, dto);
  }

  @Get(':merchantId/cash-balance')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  getCashBalance(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getCashBalance(merchantId);
  }

  @Get(':merchantId/cash')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  listCash(@Param('merchantId') merchantId: string) {
    return this.merchantsService.listCashCollections(merchantId);
  }

  /** Débit direct via HUB2 (§ app Business — Phase A) — collecte Mobile Money
   * directe sur le numéro du client, sans exiger qu'il soit utilisateur MobilePay. */
  @Post(':merchantId/debit-direct')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  debitDirect(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DebitDirectDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.paymentEngine.debitDirect(
      {
        merchantId,
        customerPhone: dto.customerPhone,
        amount: BigInt(dto.amount),
        description: dto.description ?? 'Débit direct',
        initiatedByUserId: user.userId,
        provider: dto.provider,
      },
      idempotencyKey,
    );
  }

  /** Authentifie un Débit direct par code OTP (§ nextAction.type === 'otp', ex: Orange). */
  @Post(':merchantId/debit-direct/:transactionId/authenticate')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  authenticateDebitDirect(
    @Param('transactionId') transactionId: string,
    @Body('confirmationCode') confirmationCode: string,
  ) {
    return this.paymentEngine.authenticateDebitDirect(transactionId, confirmationCode);
  }

  /**
   * Statut léger d'une transaction (§ Débit direct) — l'app Business
   * interroge cet endpoint après l'envoi pour découvrir, une fois le webhook
   * "action_required" arrivé, si une étape OTP est requise (jamais connue
   * dans la réponse HTTP immédiate de la tentative de paiement).
   */
  @Get(':merchantId/debit-direct/:transactionId/status')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  async getDebitDirectStatus(@Param('transactionId') transactionId: string) {
    const tx = await this.prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      select: { status: true, nextActionType: true, nextActionMessage: true, failureReason: true },
    });
    return tx;
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
    const customer = await this.prisma.user.findUnique({ where: { phone: normalizePhoneCI(dto.customerPhone) } });
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
