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
}

export interface ReloadlyOperator {
  operatorId: string;
  name: string;
  supportsData: boolean;
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
 * forfaits data. Contrairement à HUB2 (mobile money, asynchrone via webhook),
 * Reloadly confirme généralement de façon synchrone à l'appel API — on simule
 * donc une réponse immédiate en l'absence de credentials, ce qui permet de
 * développer et démontrer le flux sans compte Reloadly réel.
 */
@Injectable()
export class ReloadlyAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private config: ConfigService) {
    this.clientId = this.config.get('RELOADLY_CLIENT_ID', '');
    this.clientSecret = this.config.get('RELOADLY_CLIENT_SECRET', '');
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

  async purchaseAirtime(params: PurchaseAirtimeParams): Promise<AirtimeResult> {
    if (!this.clientId || !this.clientSecret) {
      // Sandbox simulé : permet de tester le flux Airtime/Data de bout en bout
      // sans compte Reloadly configuré (voir HUB2_API_KEY pour le même principe).
      return {
        providerRef: `SIMULATED-${crypto.randomUUID()}`,
        status: 'SUCCESS',
        raw: { simulated: true, kind: params.kind },
      };
    }

    // TODO Phase 6 : authentification OAuth2 Reloadly puis appel réel à
    // POST https://topups.reloadly.com/topups (airtime) ou l'endpoint forfaits
    // data équivalent, opérateur détecté automatiquement à partir du numéro,
    // ou passé explicitement via operatorId.
    throw new Error('Intégration Reloadly réelle non implémentée — configurez le mode simulé en local.');
  }
}
