import { BadRequestException, Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

/**
 * §26 : "Le système doit prévoir : création paiement, statut, webhook,
 * confirmation, échec, remboursement lorsque disponible, journalisation."
 *
 * IMPORTANT : ce controller doit recevoir le corps BRUT (non parsé) pour que
 * la vérification HMAC porte sur les octets exacts envoyés par HUB2. Voir
 * `main.ts` — `rawBody: true` doit être activé sur `NestFactory.create`.
 * Exclu de Swagger : ces routes ne sont jamais appelées par un client MobilePay.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Post('hub2')
  async handleHub2(
    @Req() req: RawBodyRequest<Request>,
    @Headers('hub2-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8');
    if (!rawBody) {
      throw new BadRequestException('Corps de requête brut manquant.');
    }
    return this.webhooksService.processHub2Webhook(rawBody, signature);
  }
}
