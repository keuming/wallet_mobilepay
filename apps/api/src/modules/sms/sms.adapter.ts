import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  success: boolean;
  providerRef?: string;
  errorReason?: string;
}

/**
 * Adaptateur pour la plateforme SMS Inter Active Media (SMSAPI) — utilisée
 * pour l'OTP d'inscription et le lien de paiement Wave en backup. Contrat
 * confirmé via leur documentation officielle (SMS_API_SPECIFICATIONS_IAM,
 * 18/09/2023) : endpoint, en-têtes et corps exacts, pas deviné.
 */
@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);
  private readonly baseUrl: string;
  private readonly appToken: string;
  private readonly senderId: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('SMS_GATEWAY_URL', 'http://135.181.44.102:8083');
    this.appToken = this.config.get('SMS_APP_TOKEN', '');
    this.senderId = this.config.get('SMS_SENDER_ID', 'MobilePay');
  }

  async send(toPhone: string, message: string): Promise<SmsSendResult> {
    if (!this.appToken) {
      this.logger.warn('SMS non envoyé — SMS_APP_TOKEN non configuré.');
      return { success: false, errorReason: 'Plateforme SMS non configurée (jeton manquant).' };
    }

    // Le format receiver attendu (§ doc) est "225" + numéro, sans "+".
    const receiver = toPhone.replace(/^\+/, '');

    const res = await fetch(`${this.baseUrl}/api/communicationManagement/v1/communicationMessage`, {
      method: 'POST',
      headers: {
        'x-app-token': this.appToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receiver,
        sender: this.senderId,
        content: message,
        messageType: 'SMS',
      }),
    });

    const rawText = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      this.logger.error(`SMS — réponse non JSON (statut ${res.status}): ${rawText.slice(0, 200)}`);
      return { success: false, errorReason: 'Réponse invalide de la plateforme SMS.' };
    }

    if (!res.ok || parsed.code !== 200) {
      this.logger.error(`SMS échoué (${res.status}): ${JSON.stringify(parsed)}`);
      return { success: false, errorReason: parsed.message ?? "Échec de l'envoi du SMS." };
    }

    return { success: true, providerRef: parsed.message_id };
  }
}
