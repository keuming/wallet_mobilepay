import { Injectable, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Adaptateur Reloadly Utility Payments (§ endpoints réels confirmés via
 * blog.reloadly.com — pas devinés) :
 *   - GET  /billers?type=&countryISOCode=&page=&size=  → liste des billers
 *   - POST /pay                                        → paiement de facture
 * Types de biller confirmés : ELECTRICITY_BILL_PAYMENT, WATER_BILL_PAYMENT,
 * TV_BILL_PAYMENT, INTERNET_BILL_PAYMENT.
 */
export type BillerType = 'ELECTRICITY_BILL_PAYMENT' | 'WATER_BILL_PAYMENT' | 'TV_BILL_PAYMENT' | 'INTERNET_BILL_PAYMENT';

export interface UtilityBiller {
  id: number;
  name: string;
  type: BillerType;
  serviceType: string; // PREPAID | POSTPAID
  countryIso: string;
  localTransactionFee: number;
  localTransactionCurrencyCode: string;
  minLocalTransactionAmount: number | null;
  maxLocalTransactionAmount: number | null;
}

export interface UtilityPaymentResult {
  transactionId: string;
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED';
  amount: number;
  currencyCode: string;
  raw: unknown;
}

function mapBiller(b: any): UtilityBiller {
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    serviceType: b.serviceType ?? '',
    countryIso: b.countryCode ?? b.countryISOCode ?? '',
    localTransactionFee: b.localTransactionFee ?? 0,
    localTransactionCurrencyCode: b.localTransactionCurrencyCode ?? '',
    minLocalTransactionAmount: b.minLocalTransactionAmount ?? null,
    maxLocalTransactionAmount: b.maxLocalTransactionAmount ?? null,
  };
}

@Injectable()
export class ReloadlyUtilitiesAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {
    this.clientId = this.config.get('RELOADLY_CLIENT_ID', '');
    this.clientSecret = this.config.get('RELOADLY_CLIENT_SECRET', '');
    this.baseUrl = this.config.get('RELOADLY_UTILITIES_BASE_URL', 'https://utilities.reloadly.com').replace(/\/+$/, '');
  }

  /** Liste des billers (factures) disponibles pour un pays, filtrable par type. */
  async listBillers(countryCode: string, type?: BillerType): Promise<UtilityBiller[]> {
    if (!this.clientId || !this.clientSecret) return [];
    const token = await this.getAccessToken();
    const params = new URLSearchParams({ countryISOCode: countryCode, size: '200' });
    if (type) params.set('type', type);
    // § Les guides officiels Reloadly (blog.reloadly.com) n'utilisent aucun
    // en-tête Accept spécifique pour ce service — seulement Authorization.
    const url = `${this.baseUrl}/billers?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Reloadly utilities billers error (${res.status}) sur ${url}: ${await res.text()}`);
    }
    const json = await res.json();
    const content = Array.isArray(json?.content) ? json.content : Array.isArray(json) ? json : [];
    return content.map(mapBiller);
  }

  /** Paye une facture (§ subscriberAccountNumber = numéro de compte/compteur du client). */
  async payBill(params: {
    billerId: number;
    subscriberAccountNumber: string;
    amount: number;
    referenceId: string;
  }): Promise<UtilityPaymentResult> {
    if (!this.clientId || !this.clientSecret) {
      return {
        transactionId: `SIMULATED-${crypto.randomUUID()}`,
        status: 'SUCCESS',
        amount: params.amount,
        currencyCode: 'XOF',
        raw: { simulated: true },
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscriberAccountNumber: params.subscriberAccountNumber,
        amount: params.amount,
        billerId: params.billerId,
        useLocalAmount: true,
        referenceId: params.referenceId,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { transactionId: params.referenceId, status: 'FAILED', amount: params.amount, currencyCode: '', raw: json };
    }

    const status = json.status === 'SUCCESSFUL' ? 'SUCCESS' : json.status === 'PROCESSING' ? 'PROCESSING' : 'FAILED';

    return {
      transactionId: String(json.transactionId ?? params.referenceId),
      status,
      amount: json.amount ?? params.amount,
      currencyCode: json.currencyCode ?? '',
      raw: json,
    };
  }

  /** Jeton OAuth2 client_credentials, mis en cache jusqu'à expiration. */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    const res = await fetch('https://auth.reloadly.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        audience: this.baseUrl,
      }),
    });

    if (!res.ok) {
      throw new BadGatewayException(`Reloadly OAuth error (${res.status}): ${await res.text()}`);
    }

    const json = await res.json();
    this.cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 30_000,
    };
    return this.cachedToken.value;
  }
}
