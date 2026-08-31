import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  InitiateTopupParams,
  InitiateWithdrawalParams,
  PaymentProviderAdapter,
  ProviderInitiationResult,
  WebhookVerificationResult,
} from './provider.interface';

export interface Hub2Balances {
  collectionAvailable: number; // centimes
  transferAvailable: number;
  transferReserved: number;
  currency: string;
  fetchedAt: string;
}

export interface PaymentIntentResult {
  id: string;
  token: string; // JWT à conserver pour l'étape "attempt a payment" (à venir)
  raw: unknown;
}

/**
 * Adaptateur HUB2 (§26) — fournisseur de paiement mobile-money local
 * (Orange Money, MTN MoMo, Moov, Wave via l'agrégateur HUB2).
 *
 * Flux cash-in (top-up) : MobilePay initie une demande de collecte auprès de
 * HUB2, qui pousse un USSD/prompt sur le téléphone du client ; HUB2 notifie
 * ensuite le résultat via webhook signé (voir WebhooksService).
 */
@Injectable()
export class Hub2Adapter implements PaymentProviderAdapter {
  readonly name = 'HUB2' as const;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly environment: 'live' | 'sandbox';
  private readonly webhookSecret: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('HUB2_BASE_URL', '');
    this.apiKey = this.config.get('HUB2_API_KEY', '');
    this.merchantId = this.config.get('HUB2_MERCHANT_ID', '');
    this.environment = this.config.get('HUB2_ENVIRONMENT', 'sandbox');
    this.webhookSecret = this.config.get('HUB2_WEBHOOK_SECRET', '');
  }

  /**
   * Solde marchand réel HUB2 (§ KPIs admin) — GET /balance, confirmé contre la
   * documentation officielle HUB2 : renvoie séparément le solde du compte
   * collecte (cash-in) et celui du compte transfert (cash-out), avec pour ce
   * dernier un solde disponible ET un solde réservé (fonds en cours de
   * traitement). HUB2 n'expose aucune notion de "solde commission" par cet
   * endpoint — les frais HUB2 apparaissent uniquement paiement par paiement,
   * jamais comme un solde agrégé consultable via l'API.
   */
  async getBalance(): Promise<Hub2Balances | null> {
    if (!this.apiKey || !this.merchantId) return null; // mode simulé, pas de clé réelle

    const res = await fetch(`${this.baseUrl}/balance`, {
      method: 'GET',
      headers: {
        ApiKey: this.apiKey,
        MerchantId: this.merchantId,
        Environment: this.environment,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HUB2 balance API error (${res.status}): ${text}`);
    }

    const json = await res.json();
    const collection = json.collectionAccount?.[0];
    const transfer = json.transferAccount?.[0];

    return {
      collectionAvailable: Math.round((collection?.availableBalance ?? 0) * 100),
      transferAvailable: Math.round((transfer?.availableBalance ?? 0) * 100),
      transferReserved: Math.round((transfer?.reservedBalance ?? 0) * 100),
      currency: collection?.currency ?? transfer?.currency ?? 'XOF',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Crée un PaymentIntent HUB2 — première étape du circuit PAY-IN (§ carte
   * bancaire Ecobank, encaissements généraux). Format vérifié contre la
   * documentation officielle (exemple curl exact, endpoint confirmé).
   *
   * ⚠️ ÉTAPE 2 NON IMPLÉMENTÉE : le contrat exact de "Attempt a payment on a
   * PaymentIntent object" (comment spécifier le circuit carte, la
   * redirection 3D Secure, etc.) n'a pas pu être confirmé avec certitude
   * contre la documentation HUB2 accessible publiquement. Ne pas construire
   * de parcours utilisateur carte tant que ce contrat n'est pas obtenu
   * directement auprès de HUB2 (collection Postman ou doc API complète) —
   * un PaymentIntent créé sans pouvoir être finalisé serait un cul-de-sac
   * pour l'utilisateur. Voir PaymentIntentResult.token, à conserver pour
   * l'appel d'attempt-payment une fois son contrat connu.
   */
  async createPaymentIntent(params: {
    customerReference: string;
    purchaseReference: string;
    amount: bigint; // centimes
    currency: string;
  }): Promise<PaymentIntentResult> {
    if (!this.apiKey || !this.merchantId) {
      throw new Error('HUB2 non configuré — impossible de créer un PaymentIntent.');
    }

    const res = await fetch(`${this.baseUrl}/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ApiKey: this.apiKey,
        MerchantId: this.merchantId,
        Environment: this.environment,
      },
      body: JSON.stringify({
        customerReference: params.customerReference,
        purchaseReference: params.purchaseReference,
        amount: Number(params.amount) / 100,
        currency: params.currency,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HUB2 create PaymentIntent error (${res.status}): ${text}`);
    }

    const json = await res.json();
    return { id: json.id, token: json.token, raw: json };
  }

  /**
   * Collecte Mobile Money réelle via HUB2 — vrai flux PAY-IN en 2 étapes,
   * conforme à la documentation officielle (vérifié via exemple curl exact) :
   *   1. Créer un PaymentIntent (montant/devise/référence)
   *   2. Tenter le paiement sur ce PaymentIntent avec paymentMethod
   *      "mobile_money", en précisant l'opérateur (provider) et le numéro
   *      (msisdn) — c'est cette étape qui déclenche le prompt USSD/PIN sur
   *      le téléphone du client via son propre opérateur.
   * Remplace l'ancien appel à `/collections`, un chemin deviné qui n'a
   * jamais existé côté HUB2 (d'où les transactions bloquées en PROCESSING).
   */
  async initiateTopup(params: InitiateTopupParams): Promise<ProviderInitiationResult> {
    const intent = await this.createPaymentIntent({
      customerReference: params.customerPhone,
      purchaseReference: params.reference,
      amount: params.amount,
      currency: params.currency,
    });
    // eslint-disable-next-line no-console
    console.log('[HUB2 DEBUG] PaymentIntent créé:', JSON.stringify(intent.raw));

    if (!this.apiKey || !this.merchantId) {
      throw new Error('HUB2 non configuré — impossible de tenter un paiement.');
    }

    const attemptBody = {
      token: intent.token,
      paymentMethod: 'mobile_money',
      country: 'CI',
      provider: params.provider.toLowerCase(),
      mobileMoney: { msisdn: params.customerPhone },
      // Exigé par HUB2 pour certains circuits (Wave notamment, qui redirige
      // le client vers sa propre interface avant de revenir) — on pointe
      // vers l'app Business en dur plutôt que via une variable d'env, pour
      // éviter toute confusion avec WEB_APP_URL (qui cible le wallet
      // particulier). § à améliorer plus tard avec un vrai écran dédié.
      onSuccessRedirectionUrl: 'https://business.mobilepay-ci.com/transactions',
      onFailedRedirectionUrl: 'https://business.mobilepay-ci.com/encaisser',
    };
    // eslint-disable-next-line no-console
    console.log('[HUB2 DEBUG] Tentative de paiement (sync) — corps envoyé:', JSON.stringify(attemptBody));

    // Endpoint SYNCHRONE (confirmé disponible pour ce compte marchand par le
    // support HUB2) — attend la réponse du fournisseur et renvoie le lien de
    // paiement (nextAction) directement dans la réponse, plutôt que de
    // dépendre d'un webhook "payment.action_required" pour l'obtenir.
    const res = await fetch(`${this.baseUrl}/payment-intents/${intent.id}/payments/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ApiKey: this.apiKey,
        MerchantId: this.merchantId,
        Environment: this.environment,
      },
      body: JSON.stringify(attemptBody),
    });

    const rawText = await res.text();
    // eslint-disable-next-line no-console
    console.log('[HUB2 DEBUG] Réponse tentative de paiement — statut', res.status, '— corps:', rawText);

    if (!res.ok) {
      throw new Error(`HUB2 attempt payment error (${res.status}): ${rawText}`);
    }

    const response = JSON.parse(rawText);

    // La référence à retenir est celle du PAIEMENT individuel (pay_...),
    // pas celle du PaymentIntent (pi_...) — c'est le paiement, pas
    // l'intention, que le webhook référence lors des mises à jour de statut.
    const payment = response.payments?.[response.payments.length - 1];

    // Le "lien de paiement" que le client doit ouvrir pour confirmer (§
    // confirmé par le support HUB2 — sans ce lien, rien n'arrive jamais
    // côté client, même si HUB2 accepte la requête). Peut se trouver sur le
    // paiement individuel ou sur l'intention selon le circuit.
    const nextAction = payment?.nextAction ?? response.nextAction;
    const paymentLink: string | undefined = nextAction?.data?.url;

    return {
      providerRef: payment?.id ?? response.id ?? intent.id,
      status: 'PENDING',
      redirectUrl: paymentLink,
      raw: response,
    };
  }

  async initiateWithdrawal(params: InitiateWithdrawalParams): Promise<ProviderInitiationResult> {
    const body = {
      amount: Number(params.amount) / 100,
      currency: params.currency,
      customer: { phone: params.customerPhone },
      reference: params.reference,
      callback_url: `${this.config.get('API_BASE_URL')}/api/webhooks/hub2`,
    };

    const response = await this.request('/disbursements', body);

    return {
      providerRef: response.id ?? response.transaction_id ?? params.reference,
      status: 'PENDING',
      raw: response,
    };
  }

  /**
   * HUB2 signe chaque webhook en HMAC-SHA256 du corps brut avec le secret partagé.
   * On recalcule la signature et on compare en temps constant (`timingSafeEqual`)
   * pour éviter les attaques par timing.
   */
  verifyWebhook(rawBody: string, signatureHeader: string): WebhookVerificationResult {
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const isValid =
      !!signatureHeader &&
      signatureHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));

    if (!isValid) {
      return { isValid: false, eventType: 'unknown', providerRef: '', status: 'FAILED' };
    }

    const payload = JSON.parse(rawBody);
    // Schéma réel confirmé via la doc officielle (objet Payment) — statuts :
    // created | failed | pending | successful. La cause d'échec est nichée
    // sous `failure.code` / `failure.message`, pas un champ plat comme
    // deviné initialement.
    const statusMap: Record<string, 'SUCCESS' | 'FAILED' | 'PENDING'> = {
      successful: 'SUCCESS',
      created: 'PENDING',
      pending: 'PENDING',
      failed: 'FAILED',
    };

    const failureMessage = payload.failure?.message
      ? `${payload.failure.code ?? ''}: ${payload.failure.message}`.trim()
      : undefined;

    return {
      isValid: true,
      eventType: payload.event ?? 'payment.status_update',
      providerRef: payload.id,
      status: statusMap[payload.status] ?? 'PENDING',
      failureReason: failureMessage,
    };
  }

  private async request(path: string, body: unknown): Promise<any> {
    // En sandbox sans clé configurée, on simule une réponse pour permettre le
    // développement local sans dépendance externe.
    if (!this.apiKey || !this.merchantId) {
      return { id: `SIMULATED-${crypto.randomUUID()}`, status: 'pending' };
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ApiKey: this.apiKey,
        MerchantId: this.merchantId,
        Environment: this.environment,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HUB2 API error (${res.status}): ${text}`);
    }

    return res.json();
  }
}
