import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QrService } from './qr.service';

/**
 * § API d'integration externe pour COMIX (et tout futur partenaire
 * similaire) — appelee par LEUR logiciel de gestion de cartes, pas par un
 * utilisateur humain connecte a ORZAYAH. Authentification par cle API
 * secrete partagee (en-tete X-Api-Key), pas par JWT.
 *
 * A chaque nouveau membre cree cote COMIX : cree le compte marchand
 * ORZAYAH ET active le QR en une seule transaction, avec le code secret
 * standard 0000 (le titulaire le changera lui-meme plus tard). Retourne
 * l'image QR (couleurs de marque) prete a embarquer sur la carte en
 * edition, sans jamais passer par le back-office.
 */
@Controller('integrations/comix')
export class ComixIntegrationController {
  constructor(
    private qrService: QrService,
    private config: ConfigService,
  ) {}

  private assertApiKey(providedKey: string | undefined) {
    const expected = this.config.get('COMIX_API_KEY');
    if (!expected || providedKey !== expected) {
      throw new UnauthorizedException('Cle API invalide.');
    }
  }

  @Post('members/link-card')
  async linkMemberCard(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: { qrCode: string; businessName: string; ownerPhone: string; country?: string },
  ) {
    this.assertApiKey(apiKey);
    const result = await this.qrService.linkQrToNewMerchant(dto.qrCode, 'COMIX_INTEGRATION', {
      businessName: dto.businessName,
      ownerPhone: dto.ownerPhone,
      country: dto.country,
    });
    const images = await this.qrService.getSingleQrImage(dto.qrCode);
    return { merchant: result.merchant, qrImage: images };
  }
}