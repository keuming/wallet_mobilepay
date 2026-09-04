import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * Aperçu des frais internes MobilePay (§ affiché au résumé, avant
 * validation, sur tous les parcours de transaction) — ne connaît QUE notre
 * propre part (pourcentage + montant fixe, paramétrable en back-office).
 * Les frais HUB2 restent inconnus tant que la transaction n'est pas
 * réellement confirmée par l'opérateur (lus dynamiquement à ce moment-là,
 * jamais ici) — le total réellement débité peut donc différer légèrement
 * de cet aperçu si des frais opérateur s'ajoutent.
 */
@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pricing')
export class PricingController {
  constructor(private pricingService: PricingService) {}

  @Get('preview')
  async preview(@Query('amount') amount: string) {
    const amountCents = BigInt(Math.round(Number(amount) * 100));
    const ourFee = await this.pricingService.computeOurFee(amountCents);
    return { feeAmount: ourFee.toString() };
  }
}
