import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PurchaseAirtimeParams {
  phoneNumber: string;
  operatorId?: string;
  amount: bigint; // centimes
  kind: 'AIRTIME' | 'DATA';
  reference: string;
}

export interface AirtimeResult {
  providerRef: string;
  status: 'SUCCESS' | 'FAILED';
  raw: unknown;
  operatorName?: string;
}

export interface ReloadlyOperator {
  operatorId: string;
  name: string;
  supportsData: boolean;
}

export interface ReloadlyBalance {
  balance: number; // centimes
  currencyCode: string;
  updatedAt: string;
}

// Heuristique simplifiée par préfixe ivoirien — en production, Reloadly expose
// un vrai endpoint de détection d'opérateur par numéro.
const CI_OPERATOR_PREFIXES: Record<string, ReloadlyOperator> = {
  '07': { operatorId: 'orange-ci', name: 'Orange CI', supportsData: true },
  '05': { operatorId: 'mtn-ci', name: 'MTN CI', supportsData: true },
  '01': { operatorId: 'moov-ci', name: 'Moov Africa CI', supportsData: true },
};

/**
 * Adaptateur Reloadly (§29) — recharge de crédit téléphonique (Airtime) et
 * forfaits data. Authentification OAuth2 client_credentials contre
 * auth.reloadly.com, puis appels signés au bearer token obtenu — conforme à
 * la documentation officielle Reloadly (developers.reloadly.com).
 */
@Injectable()
export class ReloadlyAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {
    this.clientId = this.config.get('RELOADLY_CLIENT_ID', '');
    this.clientSecret = this.config.get('RELOADLY_CLIENT_SECRET', '');
    this.baseUrl = this.config.get('RELOADLY_BASE_URL', 'https://topups.reloadly.com');
  }

  /** Détecte l'opérateur probable à partir du numéro (auto-detect §29). */
  detectOperator(phoneNumber: string): ReloadlyOperator | null {
    const local = phoneNumber.replace(/^\+225/, '').replace(/\D/g, '');
    const prefix = local.slice(0, 2);
    return CI_OPERATOR_PREFIXES[prefix] ?? null;
  }

  listKnownOperators(): ReloadlyOperator[] {
    return Object.values(CI_OPERATOR_PREFIXES);
  }

  /**
   * Solde du wallet Reloadly (§ KPIs admin) — GET /accounts/balance, conforme
   * à la doc officielle. Nécessite des identifiants réels ; renvoie `null` en
   * mode simulé (aucune clé configurée), pour un affichage honnête côté admin.
   */
  async getBalance(): Promise<ReloadlyBalance | null> {
    if (!this.clientId || !this.clientSecret) return null;

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/accounts/balance`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/com.reloadly.topups-v1+json' },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Reloadly balance API error (${res.status}): ${text}`);
    }

    const json = await res.json();
    return {
      balance: Math.round((json.balance ?? 0) * 100),
      currencyCode: json.currencyCode ?? 'USD',
      updatedAt: json.updatedAt ?? new Date().toISOString(),
    };
  }

  async purchaseAirtime(params: PurchaseAirtimeParams): Promise<AirtimeResult> {
    if (!this.clientId || !this.clientSecret) {
      // Sandbox simulé : permet de tester le flux Airtime/Data de bout en bout
      // sans compte Reloadly configuré (voir HUB2_API_KEY pour le même principe).
      const operator = this.detectOperator(params.phoneNumber);
      return {
        providerRef: `SIMULATED-${crypto.randomUUID()}`,
        status: 'SUCCESS',
        raw: { simulated: true, kind: params.kind },
        operatorName: operator?.name,
      };
    }

    const token = await this.getAccessToken();
    const body = {
      operatorId: params.operatorId,
      amount: Number(params.amount) / 100,
      useLocalAmount: true,
      recipientPhone: { countryCode: 'CI', number: params.phoneNumber.replace(/^\+225/, '') },
      customIdentifier: params.reference,
    };

    const res = await fetch(`${this.baseUrl}/topups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/com.reloadly.topups-v1+json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { providerRef: params.reference, status: 'FAILED', raw: json };
    }

    return {
      providerRef: String(json.transactionId ?? params.reference),
      status: json.status === 'SUCCESSFUL' ? 'SUCCESS' : 'FAILED',
      raw: json,
      operatorName: json.operatorName,
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
      throw new Error(`Reloadly OAuth error (${res.status}): ${await res.text()}`);
    }

    const json = await res.json();
    this.cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 30_000,
    };
    return this.cachedToken.value;
  }
}
