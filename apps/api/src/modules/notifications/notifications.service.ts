import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/**
 * Stub fonctionnel : toute notification est persistée en DB et peut être lue
 * par le client (GET /notifications). L'envoi réel (SMS via un agrégateur local
 * type IAM/Orange, push via FCM) n'est pas branché — remplacer `dispatch()` par
 * un appel au provider choisi ne change aucune signature publique.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(private prisma: PrismaService) {}

  async send(userId: string, title: string, body: string, channel: 'push' | 'sms' | 'email' = 'push') {
    const notification = await this.prisma.notification.create({
      data: { userId, title, body, channel },
    });
    await this.dispatch(notification.id, channel);
    return notification;
  }

  async listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  private async dispatch(notificationId: string, channel: string) {
    // TODO Phase 8 : brancher un provider SMS (IAM, Orange) et FCM/APNs pour le push.
    this.logger.debug(`[stub] Notification ${notificationId} envoyée via ${channel} (non implémenté).`);
  }
}
