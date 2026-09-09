import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PaymentEngineService } from './payment-engine.service';

/** Intervalle entre deux passages de réconciliation. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Une transaction plus jeune que ce délai est laissée au circuit normal
 * (webhook ou suivi côté client) — inutile de la bousculer.
 */
const MIN_AGE_MS = 90_000;

/** Au-delà, le provider a tranché depuis longtemps ; on cesse d'insister. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Réconciliation automatique des transactions restées en suspens.
 *
 * § Pourquoi c'est indispensable ici : le circuit nominal repose sur les
 * webhooks HUB2, et le filet de secours repose sur le suivi actif pendant que
 * le client regarde son écran. Mais si le webhook n'arrive jamais ET que le
 * client ferme l'application, la transaction reste bloquée indéfiniment —
 * cas réellement constaté en production, avec un client DÉBITÉ chez son
 * opérateur sans jamais être crédité chez nous.
 *
 * Ce balayage périodique ferme cette faille : il reprend les transactions en
 * suspens et va chercher leur sort réel auprès du provider, sans dépendre de
 * la présence du client.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private paymentEngine: PaymentEngineService,
  ) {}

  onModuleInit() {
    // Premier passage peu après le démarrage : sur un hébergement qui met le
    // service en veille, le réveil est justement le bon moment pour rattraper
    // ce qui a été manqué pendant l'inactivité.
    setTimeout(() => this.sweep(), 15_000);
    this.timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    // Un passage ne doit jamais en chevaucher un autre (réveil + intervalle
    // peuvent se déclencher ensemble).
    if (this.running) return;
    this.running = true;

    try {
      const now = Date.now();
      const stuck = await this.prisma.transaction.findMany({
        where: {
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
          providerName: 'HUB2',
          createdAt: {
            gte: new Date(now - MAX_AGE_MS),
            lte: new Date(now - MIN_AGE_MS),
          },
        },
        select: { id: true, type: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 25, // borne le travail par passage — on rattrape au suivant
      });

      if (stuck.length === 0) return;

      this.logger.warn(
        `Réconciliation : ${stuck.length} transaction(s) en suspens — vérification auprès du provider.`,
      );

      for (const tx of stuck) {
        try {
          await this.paymentEngine.refreshFromProvider(tx.id);
        } catch (err: any) {
          this.logger.warn(`Réconciliation (${tx.id}) : ${err?.message ?? err}`);
        }
        // Espacement volontaire : HUB2 limite le débit de son API, et ce
        // balayage ne doit jamais pénaliser les requêtes des clients réels.
        await new Promise((r) => setTimeout(r, 1_200));
      }
    } catch (err: any) {
      this.logger.error(`Réconciliation — échec du passage : ${err?.message ?? err}`);
    } finally {
      this.running = false;
    }
  }
}
