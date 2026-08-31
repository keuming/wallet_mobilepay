import { Controller, Get, NotFoundException, Param, Post, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../config/prisma.service';
import { PaymentEngineService } from '../payment-engine/payment-engine.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private prisma: PrismaService,
    private paymentEngine: PaymentEngineService,
  ) {}

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { ledgerEntries: true, paymentAttempts: true },
    });
    if (!transaction) throw new NotFoundException('Transaction introuvable.');
    await this.assertOwnership(transaction, user.userId);
    return transaction;
  }

  /** Le client confirme une demande de paiement émise par un marchand (§12 option 4). */
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentEngine.confirmPendingPayment(id, user.userId);
  }

  /**
   * Authentifie un paiement Mobile Money externe nécessitant un code OTP
   * (§ nextAction.type === 'otp', ex: Orange) — utilisable pour tout
   * paiement initié par un particulier (recharge wallet, paiement marchand).
   */
  @Post(':id/authenticate')
  async authenticate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('confirmationCode') confirmationCode: string,
  ) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction introuvable.');
    await this.assertOwnership(transaction, user.userId);
    return this.paymentEngine.authenticateDebitDirect(id, confirmationCode);
  }

  /**
   * Autorise l'accès si l'utilisateur est l'initiateur de la transaction OU
   * si son propre wallet est source/destinataire (ex: client confirmant une
   * demande de paiement créée par un marchand, où l'initiateur enregistré
   * est le marchand, pas le client).
   */
  private async assertOwnership(transaction: { initiatedByUserId: string; sourceWalletId: string | null; destWalletId: string | null }, userId: string) {
    if (transaction.initiatedByUserId === userId) return;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (wallet && (wallet.id === transaction.sourceWalletId || wallet.id === transaction.destWalletId)) return;
    throw new ForbiddenException('Cette transaction ne vous appartient pas.');
  }
}
