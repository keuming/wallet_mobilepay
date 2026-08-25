import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentEngineService } from './payment-engine.service';
import { TopupDto } from '../wallets/dto/wallets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

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
    return this.paymentEngine.initiateTopup(user.userId, BigInt(dto.amount), user.phone);
  }
}
