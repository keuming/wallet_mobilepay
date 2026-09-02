import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PurchaseAirtimeParams {
  phoneNumber: string;
  operatorId?: string;
  amount: bigint; // centimes
  kind: 'AIRTIME' | 'DATA';
  reference: string;
  countryCode?: string; // code ISO 3166-1 alpha-2 — défaut 'CI' si absent
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

// Indicatifs téléphoniques des pays couverts par HUB2 (§ multi-pays) — sert à
// isoler le numéro local avant de l'envoyer à Reloadly, qui attend le
// countryCode et le numéro local séparément.
const COUNTRY_DIAL_CODES: Record<string, string> = {
  CI: '225', SN: '221', ML: '223', BF: '226', BJ: '229', TG: '228', NE: '227',
  GW: '245', CM: '237', GA: '241', CG: '242', TD: '235', CF: '236', GQ: '240',
};

function toLocalNumber(phoneNumber: string, countryCode: string): string {
  const dialCode = COUNTRY_DIAL_CODES[countryCode] ?? '225';
  return phoneNumber.replace(/^\+?/, '').replace(new RegExp(`^${dialCode}`), '');
}

/**
 * Adaptateur Reloadly (§29) — recharge de crédit téléphonique (Airtime) et
 * forfaits data, dans n'importe quel pays couvert (§ multi-pays, plus de
 * 300 pays chez Reloadly). Authentification OAuth2 client_credentials contre
 * auth.reloadly.com. Détection d'opérateur et listing par pays via les vrais
 * endpoints Reloadly (confirmés via developers.reloadly.com et
 * support.reloadly.com — pas devinés) :
 *   - GET /operators/countries/{ISO}                          → liste par pays
 *   - GET /operators/auto-detect/phone/{numéro}/countries/{ISO} → détection
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

  /** Liste tous les opérateurs disponibles pour un pays donné (§ vrai endpoint Reloadly). */
  async listOperatorsForCountry(countryCode: string): Promise<ReloadlyOperator[]> {
    if (!this.clientId || !this.clientSecret) {
      return []; // mode simulé sans credentials — voir purchaseAirtime pour le flux simulé complet
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/operators/countries/${countryCode}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/com.reloadly.topups-v1+json' },
    });
    if (!res.ok) {
      throw new Error(`Reloadly operators-by-country error (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return (Array.isArray(json) ? json : []).map((op: any) => ({
      operatorId: String(op.operatorId ?? op.id),
      name: op.name,
      supportsData: !!op.data,
    }));
  }

  /** Détecte l'opérateur réel à partir du numéro + pays (§ vrai endpoint auto-detect Reloadly). */
  async detectOperator(phoneNumber: string, countryCode: string): Promise<ReloadlyOperator | null> {
    if (!this.clientId || !this.clientSecret) {
      return null; // mode simulé — aucune détection possible sans credentials réels
    }
    const local = toLocalNumber(phoneNumber, countryCode);
    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/operators/auto-detect/phone/${encodeURIComponent(local)}/countries/${countryCode}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/com.reloadly.topups-v1+json' } },
    );
    if (res.status === 404) return null; // "Could not auto detect operator" — réponse normale de Reloadly
    if (!res.ok) {
      throw new Error(`Reloadly auto-detect error (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return { operatorId: String(json.operatorId ?? json.id), name: json.name, supportsData: !!json.data };
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
    const countryCode = params.countryCode ?? 'CI';

    if (!this.clientId || !this.clientSecret) {
      // Sandbox simulé : permet de tester le flux Airtime/Data de bout en bout
      // sans compte Reloadly configuré (voir HUB2_API_KEY pour le même principe).
      return {
        providerRef: `SIMULATED-${crypto.randomUUID()}`,
        status: 'SUCCESS',
        raw: { simulated: true, kind: params.kind },
      };
    }

    const token = await this.getAccessToken();
    const body = {
      operatorId: params.operatorId,
      amount: Number(params.amount) / 100,
      useLocalAmount: true,
      recipientPhone: { countryCode, number: toLocalNumber(params.phoneNumber, countryCode) },
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
