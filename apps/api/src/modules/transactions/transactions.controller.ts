import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
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
  async getOne(@Param('id') id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { ledgerEntries: true, paymentAttempts: true },
    });
    if (!transaction) throw new NotFoundException('Transaction introuvable.');
    return transaction;
  }

  /** Le client confirme une demande de paiement émise par un marchand (§12 option 4). */
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentEngine.confirmPendingPayment(id, user.userId);
  }
}
