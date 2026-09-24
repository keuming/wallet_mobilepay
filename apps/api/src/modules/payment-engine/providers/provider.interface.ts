/**
 * Contrat commun à tous les providers de paiement externes (§25-29).
 *
 * Ajouter un nouveau provider (Stripe, PayPal, Reloadly) = créer une classe qui
 * implémente cette interface et l'enregistrer dans PaymentEngineModule. Aucun
 * autre module du système ne doit connaître les spécificités d'un provider.
 */
export interface InitiateTopupParams {
  walletId: string;
  amount: bigint; // centimes
  currency: string;
  customerPhone: string;
  reference: string; // référence interne ORZAYAH à faire revenir dans le webhook
  provider: string; // 'orange' | 'mtn' | 'moov' | 'wave' — exigé par le vrai flux PAY-IN HUB2
  country?: string; // code ISO 3166-1 alpha-2 — défaut 'CI' si absent
  /**
   * Code OTP fourni EN AMONT par le client (§ recommandation officielle
   * HUB2 pour Orange CI) : "demander l'OTP au client d'abord, avant de
   * tenter le paiement" — sinon le délai de 10 minutes imposé par Orange
   * s'écoule pendant que le client cherche son code, et le paiement expire.
   */
  otpCode?: string;
  /**
   * URL vers lesquelles Wave (entre autres) redirige le client après avoir
   * quitté son application. § Bug corrigé : ces URL étaient codées en dur
   * sur le dashboard marchand, quel que soit l'appelant — un client ayant
   * payé via le parcours QR Lite (sans compte) se retrouvait renvoyé vers
   * un écran de connexion marchand, sans rapport avec son achat. Chaque
   * appelant doit désormais fournir SES propres URL de retour.
   */
  onSuccessRedirectionUrl?: string;
  onFailedRedirectionUrl?: string;
  /**
   * § Paiement par carte bancaire (Visa/Mastercard). Champs deduits par
   * coherence avec le patron mobileMoney/bankTransfer de HUB2 (objet
   * nomme d'apres la methode, en camelCase) — jamais confirmes par un
   * exemple explicite dans leur documentation publique. A tester
   * imperativement en environnement sandbox avant tout paiement reel.
   */
  card?: {
    cardNumber: string;
    expiryDate: string; // format MMYY, par analogie avec les schemas de
    // paiement carte les plus courants observes ailleurs
    cvv: string;
    cardholderName: string;
  };
}

export interface InitiateWithdrawalParams {
  walletId: string;
  amount: bigint;
  currency: string;
  customerPhone: string;
  provider: string; // 'orange' | 'mtn' | 'moov' | 'wave'
  recipientName: string;
  reference: string;
  country?: string; // code ISO 3166-1 alpha-2 — défaut 'CI' si absent
}

export interface ProviderInitiationResult {
  providerRef: string;
  status: 'PENDING' | 'PROCESSING';
  redirectUrl?: string; // pour les providers qui nécessitent une étape web (Stripe, PayPal)
  nextActionType?: 'ussd' | 'otp' | 'redirection'; // § type de confirmation attendu côté client
  nextActionMessage?: string;
  raw: unknown;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventType: string;
  providerRef: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  failureReason?: string;
  /** Code technique brut du provider — journalisé pour le diagnostic, jamais affiché à l'utilisateur. */
  failureCode?: string;
  /** Somme des frais HUB2 (tableau `fees` de la réponse), en centimes —
   * dynamique, jamais paramétré côté ORZAYAH (§ tarification). */
  hub2FeeAmount?: bigint;
}

export interface PaymentProviderAdapter {
  readonly name: 'HUB2' | 'STRIPE' | 'PAYPAL' | 'RELOADLY';

  initiateTopup(params: InitiateTopupParams): Promise<ProviderInitiationResult>;
  initiateWithdrawal(params: InitiateWithdrawalParams): Promise<ProviderInitiationResult>;

  /** Vérifie la signature HMAC du webhook et normalise le payload. */
  verifyWebhook(rawBody: string, signatureHeader: string): WebhookVerificationResult;
}
