import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(Hub2Adapter.name);

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

    if (!this.apiKey || !this.merchantId) {
      throw new Error('HUB2 non configuré — impossible de tenter un paiement.');
    }

    // § Le paiement par carte n'est PAS implémenté ici, volontairement : la
    // référence API HUB2 évoque bien la carte, mais aucune documentation ne
    // décrit la structure de requête attendue, et le canal n'est pas
    // confirmé actif sur ce compte marchand. Une implémentation devinée
    // aurait échoué en production, au pire moment — devant un client en
    // train de payer. À rebrancher dès que HUB2 fournit la spécification.
    const attemptBody: Record<string, unknown> = {
      token: intent.token,
      paymentMethod: 'mobile_money',
      country: params.country ?? 'CI',
      provider: params.provider.toLowerCase(),
      mobileMoney: {
        msisdn: params.customerPhone,
        // § Si le client a déjà généré son code (Orange #144*82#), on
        // l'envoie directement : le paiement part authentifié et ne
        // consomme pas le délai d'expiration de 10 minutes d'Orange.
        ...(params.otpCode ? { otp: params.otpCode } : {}),
        // Exigé par HUB2 pour certains circuits (Wave notamment, qui
        // redirige le client vers sa propre interface avant de revenir) —
        // doivent être imbriqués DANS mobileMoney (schéma officiel
        // PayMobileMoneyDto), pas au niveau racine du corps.
        onSuccessRedirectionUrl: 'https://business.mobilepay-ci.com/transactions',
        onFailedRedirectionUrl: 'https://business.mobilepay-ci.com/encaisser',
      },
    };

    this.logger.log(
      `PAY-IN initié — provider=${attemptBody.provider} country=${attemptBody.country} ` +
        `msisdn=${params.customerPhone} reference=${params.reference}`,
    );

    // Endpoint ASYNCHRONE — l'endpoint synchrone (/sync) est rejeté (401)
    // pour les opérateurs de ce compte. Le résultat final (succès/échec,
    // type d'action requise) arrive via webhook, événement
    // "payment.action_required" puis "payment.succeeded"/"payment.failed".
    const res = await fetch(`${this.baseUrl}/payment-intents/${intent.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attemptBody),
    });

    const rawText = await res.text();

    if (!res.ok) {
      this.logger.error(`PAY-IN — HUB2 a rejeté la demande (${res.status}) : ${rawText}`);
      throw new Error(`HUB2 attempt payment error (${res.status}): ${rawText}`);
    }

    this.logger.log(`PAY-IN — réponse HUB2 (200 OK) : ${rawText}`);

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
      nextActionType: nextAction?.type,
      nextActionMessage: nextAction?.message,
      raw: response,
    };
  }

  /**
   * Authentifie un paiement nécessitant un code OTP (§ nextAction.type ===
   * 'otp') — le client génère ce code via son opérateur, puis le transmet
   * pour finaliser le paiement. Ne s'applique QUE si l'intention précédente
   * a renvoyé un nextAction de type "otp" — pour "ussd" (confirmation directe
   * sur le téléphone) ou "redirection" (Wave, lien), cette étape ne s'utilise
   * jamais.
   */
  async authenticatePayment(intentId: string, token: string, confirmationCode: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/payment-intents/${intentId}/authentication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, confirmationCode }),
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`HUB2 authenticate payment error (${res.status}): ${rawText}`);
    }
    return JSON.parse(rawText);
  }

  /**
   * PAY-OUT — envoi d'argent vers un compte Mobile Money externe. Endpoint
   * et corps confirmés via la doc officielle HUB2 (POST /transfers), après
   * découverte que l'ancien /disbursements deviné n'a jamais existé — même
   * défaut que /collections corrigé plus tôt pour le PAY-IN.
   */
  async initiateWithdrawal(params: InitiateWithdrawalParams): Promise<ProviderInitiationResult> {
    if (!this.apiKey || !this.merchantId) {
      // Mode simulé (pas de clé réelle configurée) — permet le développement
      // local sans dépendance externe.
      return { providerRef: `SIMULATED-${crypto.randomUUID()}`, status: 'PENDING', raw: null };
    }

    const body = {
      reference: params.reference.replace(/[^A-Za-z0-9\-_. ]/g, ''), // HUB2 rejette les caractères spéciaux
      amount: Number(params.amount) / 100,
      currency: params.currency,
      description: `MobilePay — envoi vers ${params.recipientName}`,
      destination: {
        type: 'mobile_money',
        country: params.country ?? 'CI',
        msisdn: params.customerPhone,
        provider: params.provider.toLowerCase(),
        recipientName: params.recipientName,
      },
    };

    const res = await fetch(`${this.baseUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ApiKey: this.apiKey,
        MerchantId: this.merchantId,
        Environment: this.environment,
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`HUB2 transfer error (${res.status}): ${rawText}`);
    }
    const response = JSON.parse(rawText);

    return {
      providerRef: response.id ?? params.reference,
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
    // Format réel confirmé (doc officielle) : "HUB2-Signature: s1=XXXX,s0=YYYY"
    // — s1 = signature avec le secret actuel, s0 = avec l'ancien secret
    // (fenêtre de grâce de 24h lors d'une rotation). On extrait s1.
    const parts = Object.fromEntries(
      (signatureHeader ?? '')
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((p) => p.length === 2),
    );
    const providedSignature = parts['s1'];

    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');

    const isValid =
      !!providedSignature &&
      providedSignature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expected));

    if (!isValid) {
      return { isValid: false, eventType: 'unknown', providerRef: '', status: 'FAILED' };
    }

    // Le vrai contenu est enveloppé : { type, data: {...objet Payment...}, id, createdAt }
    const envelope = JSON.parse(rawBody);
    const payload = envelope.data ?? envelope;

    // Schéma réel confirmé via la doc officielle. Deux vocabulaires
    // coexistent selon le type d'événement :
    //  - objet Payment (PAY-IN) : created | pending | successful | failed
    //  - objet Transfer (PAY-OUT) : created | processing | succeeded | failed
    // On couvre les deux pour que le même décodeur serve aux deux flux.
    const statusMap: Record<string, 'SUCCESS' | 'FAILED' | 'PENDING'> = {
      successful: 'SUCCESS',
      succeeded: 'SUCCESS',
      created: 'PENDING',
      pending: 'PENDING',
      processing: 'PENDING',
      failed: 'FAILED',
    };

    // § Messages HUB2 bruts traduits en explications actionnables — un
    // code technique comme "authentication_failed" n'aide pas l'utilisateur
    // à savoir quoi faire différemment la prochaine fois.
    //
    // § Enrichi à l'audit pré-production avec les codes RÉELLEMENT observés
    // dans les logs de production (les codes génériques ci-dessous ne
    // couvraient pas les formats réels renvoyés par HUB2, ex:
    // "customer_insufficient_funds", "wave_payment_expired" — l'utilisateur
    // voyait donc un message technique en anglais).
    const FRIENDLY_FAILURE_MESSAGES: Record<string, string> = {
      // Codes génériques
      authentication_failed:
        "La validation du paiement a échoué — vérifie que tu as bien confirmé avec le bon code PIN Mobile Money, puis réessaie.",
      insufficient_funds: "Solde Mobile Money insuffisant pour cette opération.",
      expired: "Le délai de confirmation a expiré avant que le paiement soit validé — réessaie.",
      cancelled: "Le paiement a été annulé.",
      timeout: "L'opérateur n'a pas répondu à temps — réessaie dans quelques instants.",

      // Codes réels confirmés en production
      customer_insufficient_funds:
        "Solde insuffisant sur ton compte Mobile Money — recharge-le puis réessaie.",
      wave_payment_expired:
        "Le lien de paiement Wave a expiré. Relance l'opération pour obtenir un nouveau lien.",
      customer_canceled: "Tu as annulé le paiement sur ton téléphone.",
      customer_cancelled: "Tu as annulé le paiement sur ton téléphone.",
      invalid_customer_number:
        "Ce numéro Mobile Money n'est pas valide ou n'est pas actif chez cet opérateur.",
      customer_not_found:
        "Aucun compte Mobile Money trouvé pour ce numéro chez cet opérateur.",
      transaction_limit_exceeded:
        "Le montant dépasse le plafond autorisé par ton opérateur Mobile Money.",
      operator_unavailable:
        "L'opérateur Mobile Money est momentanément indisponible — réessaie dans quelques instants.",
    };

    const failureCode = payload.failure?.code;
    // § Un code inconnu ne doit jamais être affiché brut à l'utilisateur
    // (ex: "wave_payment_expired: Payment too old..." tel qu'observé en
    // production) — on retombe sur un message générique compréhensible, le
    // code technique restant journalisé côté serveur pour le diagnostic.
    const failureMessage = payload.failure?.message
      ? (FRIENDLY_FAILURE_MESSAGES[failureCode ?? ''] ??
        "Le paiement n'a pas pu aboutir. Réessaie, ou contacte ton opérateur Mobile Money si le problème persiste.")
      : undefined;

    // § Frais HUB2 réels (tableau `fees` de l'objet Payment/Transfer,
    // confirmé par la doc officielle) — jamais paramétrés côté MobilePay,
    // juste lus et additionnés ici pour la tarification (§ pricing).
    const hub2FeeAmount = Array.isArray(payload.fees)
      ? payload.fees.reduce((sum: bigint, f: any) => sum + BigInt(Math.round(Number(f.amount ?? 0) * 100)), 0n)
      : undefined;

    return {
      isValid: true,
      eventType: envelope.type ?? 'payment.status_update',
      providerRef: payload.id,
      status: statusMap[payload.status] ?? 'PENDING',
      failureReason: failureMessage,
      failureCode,
      hub2FeeAmount,
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

  /**
   * Interroge ACTIVEMENT HUB2 sur l'état d'un paiement.
   *
   * § Filet de sécurité indispensable : le circuit nominal repose sur les
   * webhooks, mais si HUB2 ne parvient pas à joindre notre serveur (service
   * en veille, coupure réseau, endpoint désactivé après échecs répétés), la
   * transaction reste bloquée en PROCESSING indéfiniment et le client
   * n'obtient jamais son lien de paiement — cas réellement constaté en
   * production. On ne dépend donc plus uniquement d'être appelé : on va
   * chercher l'information nous-mêmes.
   */
  async fetchPaymentIntentStatus(intentId: string): Promise<{
    status: string;
    nextActionType?: string;
    nextActionMessage?: string;
    nextActionUrl?: string;
    failureCode?: string;
    failureReason?: string;
  } | null> {
    if (!this.apiKey) return null;

    try {
      const res = await fetch(`${this.baseUrl}/payment-intents/${intentId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ApiKey: this.apiKey,
          MerchantId: this.merchantId,
          // § L'en-tête Environment est EXIGÉ par HUB2 — son absence
          // provoquait un 401 sur cette relance alors que les autres appels
          // (qui l'envoient) fonctionnaient parfaitement.
          Environment: this.environment,
        },
      });

      if (!res.ok) {
        this.logger.warn(`Relance statut HUB2 (${intentId}) — réponse ${res.status}`);
        return null;
      }

      const json = await res.json();
      const payment = json.payments?.[json.payments.length - 1];
      const nextAction = payment?.nextAction ?? json.nextAction;

      const statusMap: Record<string, string> = {
        successful: 'SUCCESS',
        succeeded: 'SUCCESS',
        failed: 'FAILED',
        canceled: 'CANCELLED',
        cancelled: 'CANCELLED',
        expired: 'EXPIRED',
      };
      const raw = String(payment?.status ?? json.status ?? '').toLowerCase();

      this.logger.log(
        `Relance statut HUB2 (${intentId}) : status=${raw} nextAction=${nextAction?.type ?? '(aucun)'}`,
      );

      return {
        status: statusMap[raw] ?? 'PENDING',
        nextActionType: nextAction?.type,
        nextActionMessage: nextAction?.message,
        nextActionUrl: nextAction?.data?.url,
        failureCode: payment?.failure?.code ?? json.failure?.code,
        failureReason: payment?.failure?.message ?? json.failure?.message,
      };
    } catch (err: any) {
      this.logger.warn(`Relance statut HUB2 (${intentId}) — exception : ${err?.message ?? err}`);
      return null;
    }
  }

}
