import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto, CreatePaymentRequestDto, TransferFromMerchantDto, SellAirtimeDto, BuyGiftCardDto, PayUtilityBillDto, RecordCashDto, DebitDirectDto, CreateRetailerDto, RetailerFundDto, RetailerStatusDto } from './dto/merchants.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MerchantScopeGuard } from '../../common/guards/merchant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../config/prisma.service';
import { PaymentEngineService } from '../payment-engine/payment-engine.service';
import { SmsAdapter } from '../sms/sms.adapter';
import { normalizePhoneCI, normalizePhoneCandidates } from '../../common/utils/phone.util';
import { NotFoundException, BadRequestException } from '@nestjs/common';

@ApiTags('merchants')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantsController {
  constructor(
    private merchantsService: MerchantsService,
    private prisma: PrismaService,
    private paymentEngine: PaymentEngineService,
    private sms: SmsAdapter,
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

  /** Catalogue de cartes cadeaux disponibles pour un pays. */
  @Get(':merchantId/gift-cards/products')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  listGiftCardProducts(@Query('country') country: string = 'CI') {
    return this.merchantsService.listGiftCardProducts(country);
  }

  /** Achat de carte cadeau, financé par le wallet marchand. */
  @Post(':merchantId/gift-cards/orders')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  buyGiftCard(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BuyGiftCardDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.merchantsService.buyGiftCard(merchantId, user.userId, dto, idempotencyKey);
  }

  /** Catalogue de fournisseurs de factures disponibles pour un pays. */
  @Get(':merchantId/utility-payments/billers')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  listUtilityBillers(@Query('country') country: string = 'CI', @Query('type') type?: string) {
    return this.merchantsService.listUtilityBillers(country, type as any);
  }

  /** Paiement de facture pour un client, financé par le wallet marchand. */
  @Post(':merchantId/utility-payments/pay')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  payUtilityBill(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PayUtilityBillDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.merchantsService.payUtilityBill(merchantId, user.userId, dto, idempotencyKey);
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

  // --- § Hiérarchie distributeur → détaillants (comptes Business) ---

  @Post(':merchantId/retailers')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  createRetailer(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRetailerDto,
  ) {
    return this.merchantsService.createRetailer(merchantId, user.userId, dto);
  }

  @Get(':merchantId/retailers')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  listRetailers(@Param('merchantId') merchantId: string) {
    return this.merchantsService.listRetailers(merchantId);
  }

  @Post(':merchantId/retailers/:retailerId/fund')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  fundRetailer(
    @Param('merchantId') merchantId: string,
    @Param('retailerId') retailerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RetailerFundDto,
  ) {
    return this.merchantsService.fundRetailer(
      merchantId,
      retailerId,
      BigInt(dto.amount),
      dto.description ?? 'Approvisionnement détaillant',
      user.userId,
    );
  }

  @Post(':merchantId/retailers/:retailerId/debit')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  debitRetailer(
    @Param('merchantId') merchantId: string,
    @Param('retailerId') retailerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RetailerFundDto,
  ) {
    return this.merchantsService.debitRetailer(
      merchantId,
      retailerId,
      BigInt(dto.amount),
      dto.description ?? 'Débit détaillant',
      user.userId,
    );
  }

  @Patch(':merchantId/retailers/:retailerId/status')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  setRetailerStatus(
    @Param('merchantId') merchantId: string,
    @Param('retailerId') retailerId: string,
    @Body() dto: RetailerStatusDto,
  ) {
    return this.merchantsService.setRetailerStatus(merchantId, retailerId, dto.status);
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
      select: {
        status: true,
        nextActionType: true,
        nextActionMessage: true,
        nextActionUrl: true,
        failureReason: true,
      },
    });
    return tx;
  }

  /**
   * Envoie le lien de paiement par SMS (§ backup Wave — le marchand n'a pas
   * toujours de crédit SMS personnel pour le transmettre lui-même).
   */
  @Post(':merchantId/debit-direct/:transactionId/send-sms')
  @UseGuards(JwtAuthGuard, MerchantScopeGuard)
  async sendPaymentLinkSms(
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tx = await this.prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      select: { nextActionUrl: true },
    });
    if (!tx.nextActionUrl) {
      throw new NotFoundException('Aucun lien de paiement disponible pour cette transaction.');
    }

    // Le numéro du client n'est pas stocké directement sur la transaction —
    // récupéré depuis la tentative de paiement associée.
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { transactionId, providerName: 'HUB2' },
      orderBy: { createdAt: 'desc' },
    });
    const raw = attempt?.rawResponse as any;
    const toPhone = normalizePhoneCI(raw?.payments?.[0]?.number ?? raw?.customerReference ?? '');

    const message = `MobilePay : ouvre ce lien pour confirmer ton paiement — ${tx.nextActionUrl}`;
    const result = await this.sms.send(toPhone, message);

    await this.prisma.smsLog.create({
      data: {
        toPhone,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        providerRef: result.providerRef,
        errorReason: result.errorReason,
        transactionId,
        sentByUserId: user.userId,
      },
    });

    if (!result.success) {
      throw new BadRequestException(result.errorReason ?? "Échec de l'envoi du SMS.");
    }
    return { sent: true };
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
    // § Le client peut être dans un autre pays — on essaie chaque pays
    // supporté plutôt que de supposer 'CI'.
    const customer = await this.prisma.user.findFirst({ where: { phone: { in: normalizePhoneCandidates(dto.customerPhone) } } });
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
