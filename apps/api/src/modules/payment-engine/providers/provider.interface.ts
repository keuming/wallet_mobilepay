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
  reference: string; // référence interne MobilePay à faire revenir dans le webhook
  provider: string; // 'orange' | 'mtn' | 'moov' | 'wave' — exigé par le vrai flux PAY-IN HUB2
}

export interface InitiateWithdrawalParams {
  walletId: string;
  amount: bigint;
  currency: string;
  customerPhone: string;
  provider: string; // 'orange' | 'mtn' | 'moov' | 'wave'
  recipientName: string;
  reference: string;
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
}

export interface PaymentProviderAdapter {
  readonly name: 'HUB2' | 'STRIPE' | 'PAYPAL' | 'RELOADLY';

  initiateTopup(params: InitiateTopupParams): Promise<ProviderInitiationResult>;
  initiateWithdrawal(params: InitiateWithdrawalParams): Promise<ProviderInitiationResult>;

  /** Vérifie la signature HMAC du webhook et normalise le payload. */
  verifyWebhook(rawBody: string, signatureHeader: string): WebhookVerificationResult;
}
