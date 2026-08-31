import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  success: boolean;
  providerRef?: string;
  errorReason?: string;
}

/**
 * Adaptateur pour la plateforme SMS interne (§ lien de paiement Wave en
 * backup, quand le marchand n'a pas de crédit SMS personnel pour le
 * transmettre lui-même). Dashboard : http://135.181.44.102:8083/dashboard/html/
 *
 * ⚠️ L'appel HTTP réel ci-dessous n'est PAS encore branché — le contrat
 * exact de l'API (endpoint, méthode, paramètres) doit être confirmé sur le
 * dashboard avant activation, pour éviter de deviner un format qui
 * échouerait silencieusement en production (voir tout le travail de
 * vérification fait pour HUB2 dans cette même session — même principe ici).
 */
@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly pass: string;
  private readonly senderId: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('SMS_GATEWAY_URL', '');
    this.user = this.config.get('SMS_GATEWAY_USER', '');
    this.pass = this.config.get('SMS_GATEWAY_PASSWORD', '');
    this.senderId = this.config.get('SMS_SENDER_ID', 'MobilePay');
  }

  async send(toPhone: string, message: string): Promise<SmsSendResult> {
    if (!this.baseUrl || !this.user || !this.pass) {
      this.logger.warn('SMS non envoyé — plateforme SMS non configurée (contrat API à confirmer).');
      return { success: false, errorReason: 'Plateforme SMS non configurée.' };
    }

    // TODO : brancher le vrai appel une fois le contrat API confirmé.
    // Exemple probable (à vérifier) :
    //   GET `${this.baseUrl}/api/send?user=${this.user}&pass=${this.pass}&to=${toPhone}&text=${encodeURIComponent(message)}&sender=${this.senderId}`
    this.logger.warn('SMS non envoyé — appel HTTP réel pas encore implémenté (contrat API en attente).');
    return { success: false, errorReason: 'Envoi SMS pas encore activé.' };
  }
}
