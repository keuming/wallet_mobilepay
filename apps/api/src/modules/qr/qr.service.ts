import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../config/prisma.service';
import { PaymentEngineService } from '../payment-engine/payment-engine.service';
import { CreateDynamicQrDto, CreatePaymentLinkDto } from '../merchants/dto/merchants.dto';

@Injectable()
export class QrService {
  constructor(
    private prisma: PrismaService,
    private paymentEngine: PaymentEngineService,
    private config: ConfigService,
  ) {}

  /** QR statique du marchand, généré à sa création (§13). */
  async getMerchantStaticQr(merchantId: string) {
    const qr = await this.prisma.qrCode.findFirst({
      where: { merchantId, type: 'MERCHANT_STATIC' },
    });
    if (!qr) throw new NotFoundException('QR marchand introuvable.');
    const url = `${this.config.get('QR_LINK_BASE_URL')}/q/${qr.code}`;
    const imageDataUrl = await QRCode.toDataURL(url);
    return { ...qr, url, imageDataUrl };
  }

  /** Liste tous les QR (statique + dynamiques) d'un marchand (§11 onglet QR Codes). */
  async listMerchantQr(merchantId: string) {
    return this.prisma.qrCode.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Liste les Payment Links d'un marchand (§11 onglet Payment Links). */
  async listPaymentLinks(merchantId: string) {
    const links = await this.prisma.paymentLink.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => ({
      ...link,
      url: `${this.config.get('QR_LINK_BASE_URL')}/p/${link.slug}`,
    }));
  }

  /** Génère (ou retourne) le QR personnel d'un particulier (§6). */
  async getOrCreatePersonalQr(userId: string) {
    let qr = await this.prisma.qrCode.findUnique({ where: { ownerUserId: userId } });
    if (!qr) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      qr = await this.prisma.qrCode.create({
        data: {
          code: `MPU${user.id.slice(0, 10).toUpperCase()}`,
          type: 'PARTICULIER',
          status: 'ACTIVE',
          ownerUserId: userId,
        },
      });
    }
    const url = `${this.config.get('QR_LINK_BASE_URL')}/u/${qr.code}`;
    const imageDataUrl = await QRCode.toDataURL(url);
    return { ...qr, url, imageDataUrl };
  }

  /** Crée un QR dynamique à montant fixe et durée de vie limitée (§12 option 2). */
  async createDynamicQr(merchantId: string, dto: CreateDynamicQrDto) {
    const expiresInSeconds = dto.expiresInSeconds ?? 900;
    const qr = await this.prisma.qrCode.create({
      data: {
        code: `MPD${nanoid(10).toUpperCase()}`,
        type: 'MERCHANT_DYNAMIC',
        status: 'ACTIVE',
        merchantId,
        fixedAmount: BigInt(dto.amount),
        description: dto.description,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });
    const url = `${this.config.get('QR_LINK_BASE_URL')}/q/${qr.code}`;
    const imageDataUrl = await QRCode.toDataURL(url);
    return { ...qr, url, imageDataUrl };
  }

  /** Résout un code QR public en informations de paiement (avant confirmation). */
  async resolveQr(code: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { code },
      include: { merchant: true, ownerUser: { select: { firstName: true, lastName: true } } },
    });
    if (!qr) throw new NotFoundException('QR introuvable.');
    if (qr.status === 'BLOCKED') throw new BadRequestException('Ce QR a été bloqué.');
    if (qr.expiresAt && qr.expiresAt < new Date()) {
      throw new BadRequestException('Ce QR a expiré.');
    }
    return qr;
  }

  /** Paie un QR marchand (statique ou dynamique) — appelé par le wallet du payeur. */
  async payQr(
    payerUserId: string,
    code: string,
    amount: number | undefined,
    fundingSource: 'WALLET' | 'MOBILE_MONEY',
    pin: string,
    idempotencyKey: string,
    customerPhone?: string,
  ) {
    const qr = await this.resolveQr(code);

    if (qr.type === 'PARTICULIER') {
      throw new BadRequestException('Ce QR est un QR personnel, utilisez /api/transfers.');
    }
    if (!qr.merchantId) throw new BadRequestException('QR marchand invalide.');

    const finalAmount = qr.fixedAmount ?? (amount ? BigInt(amount) : null);
    if (!finalAmount) {
      throw new BadRequestException('Un montant est requis pour ce QR.');
    }
    const description = qr.description ?? `Paiement QR ${qr.code}`;

    if (fundingSource === 'MOBILE_MONEY') {
      if (!customerPhone) throw new BadRequestException('Le numéro Mobile Money est requis.');
      return this.paymentEngine.collectForMerchantFromExternal(
        { payerUserId, merchantId: qr.merchantId, amount: finalAmount, description, customerPhone, pin },
        idempotencyKey,
      );
    }

    return this.paymentEngine.collectForMerchant({
      payerUserId,
      merchantId: qr.merchantId,
      amount: finalAmount,
      description,
      idempotencyKey,
      pin,
    });
  }

  async createPaymentLink(merchantId: string, dto: CreatePaymentLinkDto) {
    const link = await this.prisma.paymentLink.create({
      data: {
        slug: nanoid(6).toUpperCase(),
        merchantId,
        amount: dto.amount ? BigInt(dto.amount) : null,
        description: dto.description,
      },
    });
    const url = `${this.config.get('QR_LINK_BASE_URL')}/p/${link.slug}`;
    const imageDataUrl = await QRCode.toDataURL(url);
    return { ...link, url, imageDataUrl };
  }

  async resolvePaymentLink(slug: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { slug },
      include: { merchant: true },
    });
    if (!link) throw new NotFoundException('Lien de paiement introuvable.');
    if (link.status !== 'ACTIVE') throw new BadRequestException('Ce lien n\'est plus actif.');
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException('Ce lien a expiré.');
    }
    return link;
  }

  async payPaymentLink(
    payerUserId: string,
    slug: string,
    amount: number | undefined,
    fundingSource: 'WALLET' | 'MOBILE_MONEY',
    pin: string,
    idempotencyKey: string,
    customerPhone?: string,
  ) {
    const link = await this.resolvePaymentLink(slug);
    const finalAmount = link.amount ?? (amount ? BigInt(amount) : null);
    if (!finalAmount) throw new BadRequestException('Un montant est requis pour ce lien.');
    const description = link.description ?? `Paiement lien ${link.slug}`;

    if (fundingSource === 'MOBILE_MONEY') {
      if (!customerPhone) throw new BadRequestException('Le numéro Mobile Money est requis.');
      return this.paymentEngine.collectForMerchantFromExternal(
        { payerUserId, merchantId: link.merchantId, amount: finalAmount, description, customerPhone, pin },
        idempotencyKey,
      );
    }

    return this.paymentEngine.collectForMerchant({
      payerUserId,
      merchantId: link.merchantId,
      amount: finalAmount,
      description,
      idempotencyKey,
      pin,
    });
  }
}
