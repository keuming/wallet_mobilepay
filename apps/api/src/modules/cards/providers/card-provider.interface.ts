import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface IssueCardParams {
  holderName: string;
  currency: string;
  reference: string;
}

export interface IssueCardResult {
  providerRef: string;
  maskedPan: string;
  expiryMonth: number;
  expiryYear: number;
  status: 'ACTIVE' | 'PENDING';
}

/**
 * Contrat commun à tout partenaire d'émission de carte virtuelle
 * (Union33, Onafriq, ou tout autre agrégateur Visa/Mastercard en Afrique de
 * l'Ouest). Comme pour HUB2/Reloadly, aucun partenaire n'est choisi en dur —
 * ajouter le vrai partenaire = implémenter cette interface, sans toucher au
 * reste du système.
 */
export interface CardProviderAdapter {
  issueCard(params: IssueCardParams): Promise<IssueCardResult>;
  freezeCard(providerRef: string): Promise<void>;
  unfreezeCard(providerRef: string): Promise<void>;
}

/**
 * Implémentation simulée — génère un faux PAN masqué et une référence, sans
 * appel réseau. Permet de développer et démontrer le flux complet (demande,
 * chargement, gel) avant qu'un vrai partenaire ne soit choisi et intégré.
 * Aucune donnée de carte réelle n'est jamais générée ni stockée.
 */
@Injectable()
export class SimulatedCardAdapter implements CardProviderAdapter {
  constructor(private config: ConfigService) {}

  async issueCard(params: IssueCardParams): Promise<IssueCardResult> {
    const lastFour = Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date();
    return {
      providerRef: `SIMULATED-CARD-${crypto.randomUUID()}`,
      maskedPan: `•••• •••• •••• ${lastFour}`,
      expiryMonth: ((now.getMonth() + 1) % 12) + 1,
      expiryYear: now.getFullYear() + 3,
      status: 'ACTIVE',
    };
  }

  async freezeCard(_providerRef: string): Promise<void> {
    // TODO : appel réel à l'API du partenaire une fois choisi.
  }

  async unfreezeCard(_providerRef: string): Promise<void> {
    // TODO : appel réel à l'API du partenaire une fois choisi.
  }
}
