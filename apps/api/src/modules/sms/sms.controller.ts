import { Body, Controller, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsPhoneNumber, IsString, IsUrl, MaxLength } from 'class-validator';
import { SmsAdapter } from './sms.adapter';
import { PrismaService } from '../../config/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { normalizePhoneCI } from '../../common/utils/phone.util';

export class SendLinkSmsDto {
  @IsPhoneNumber(undefined, { message: 'Numéro invalide.' })
  toPhone: string;

  @IsUrl({}, { message: 'Lien invalide.' })
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string; // ex: "ton lien de paiement", "le lien pour recevoir ton argent"
}

/**
 * Partage générique d'un lien par SMS (§ tout lien de paiement — QR
 * marchand, QR particulier, lien de demande, backup Wave) — utilisable
 * depuis n'importe quel écran, particulier ou marchand, pas lié à une
 * transaction précise.
 */
@ApiTags('sms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sms')
export class SmsController {
  constructor(
    private sms: SmsAdapter,
    private prisma: PrismaService,
  ) {}

  @Post('send-link')
  async sendLink(@Body() dto: SendLinkSmsDto, @CurrentUser() user: AuthenticatedUser) {
    const toPhone = normalizePhoneCI(dto.toPhone);
    const message = `MobilePay CI : voici ${dto.label ?? 'ton lien'} — ${dto.url}`;

    const result = await this.sms.send(toPhone, message);

    await this.prisma.smsLog.create({
      data: {
        toPhone,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        providerRef: result.providerRef,
        errorReason: result.errorReason,
        sentByUserId: user.userId,
      },
    });

    if (!result.success) {
      throw new BadRequestException(result.errorReason ?? "Échec de l'envoi du SMS.");
    }
    return { sent: true };
  }
}
