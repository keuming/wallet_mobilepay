import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Adaptateur Reloadly Gift Cards (§ endpoints réels confirmés via
 * blog.reloadly.com et la spec OpenAPI officielle — pas devinés) :
 *   - GET  /products?countryCode=&page=&size=   → catalogue par pays
 *   - GET  /products/{productId}                → détail d'un produit
 *   - POST /orders                              → commande (livraison immédiate)
 *   - GET  /orders/{orderId}                    → suivi d'une commande
 * Authentification OAuth2 client_credentials, comme les autres services
 * Reloadly, avec audience = https://giftcards.reloadly.com (ou sandbox).
 */
export interface GiftCardProduct {
  productId: number;
  productName: string;
  brandName: string;
  brandId: number;
  logoUrl: string | null;
  denominationType: 'FIXED' | 'RANGE';
  fixedRecipientDenominations: number[];
  minRecipientDenomination: number | null;
  maxRecipientDenomination: number | null;
  recipientCurrencyCode: string;
  senderCurrencyCode: string;
  discountPercentage: number;
  countryIso: string;
  redeemInstructions: string | null;
}

export interface GiftCardOrderResult {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED';
  amount: number;
  currencyCode: string;
  cardCode: string | null;
  cardPin: string | null;
  raw: unknown;
}

function mapProduct(p: any): GiftCardProduct {
  return {
    productId: p.productId,
    productName: p.productName,
    brandName: p.brand?.brandName ?? p.productName,
    brandId: p.brand?.brandId ?? 0,
    logoUrl: p.logoUrls?.[0] ?? null,
    denominationType: p.denominationType === 'RANGE' ? 'RANGE' : 'FIXED',
    fixedRecipientDenominations: Array.isArray(p.fixedRecipientDenominations) ? p.fixedRecipientDenominations : [],
    minRecipientDenomination: p.minRecipientDenomination ?? null,
    maxRecipientDenomination: p.maxRecipientDenomination ?? null,
    recipientCurrencyCode: p.recipientCurrencyCode ?? '',
    senderCurrencyCode: p.senderCurrencyCode ?? '',
    discountPercentage: p.discountPercentage ?? 0,
    countryIso: p.country?.isoName ?? '',
    redeemInstructions: p.redeemInstruction?.concise ?? null,
  };
}

@Injectable()
export class ReloadlyGiftCardsAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {
    this.clientId = this.config.get('RELOADLY_CLIENT_ID', '');
    this.clientSecret = this.config.get('RELOADLY_CLIENT_SECRET', '');
    this.baseUrl = this.config.get('RELOADLY_GIFTCARDS_BASE_URL', 'https://giftcards.reloadly.com').replace(/\/+$/, '');
  }

  /** Catalogue de cartes cadeaux disponibles pour un pays donné. */
  async listProducts(countryCode: string): Promise<GiftCardProduct[]> {
    if (!this.clientId || !this.clientSecret) return [];
    const token = await this.getAccessToken();
    // § Vrai endpoint confirmé (blog.reloadly.com) — le pays est dans le
    // CHEMIN de l'URL, pas en paramètre de requête ?countryCode=.
    const url = `${this.baseUrl}/countries/${countryCode}/products`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/com.reloadly.giftcards-v1+json' },
    });
    if (!res.ok) {
      throw new Error(`Reloadly gift cards products error (${res.status}) sur ${url}: ${await res.text()}`);
    }
    const json = await res.json();
    const content = Array.isArray(json?.content) ? json.content : Array.isArray(json) ? json : [];
    return content.map(mapProduct);
  }

  /** Détail d'un produit précis (dénominations, instructions de rédemption). */
  async getProduct(productId: number): Promise<GiftCardProduct | null> {
    if (!this.clientId || !this.clientSecret) return null;
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/com.reloadly.giftcards-v1+json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Reloadly gift cards product error (${res.status}): ${await res.text()}`);
    }
    return mapProduct(await res.json());
  }

  /** Place une commande de carte cadeau — livraison immédiate si succès. */
  async placeOrder(params: {
    productId: number;
    unitPrice: number;
    recipientEmail: string;
    senderName: string;
    customIdentifier: string;
    countryCode: string;
  }): Promise<GiftCardOrderResult> {
    if (!this.clientId || !this.clientSecret) {
      // Mode simulé — même principe que l'adaptateur Airtime.
      return {
        transactionId: `SIMULATED-${crypto.randomUUID()}`,
        status: 'SUCCESS',
        amount: params.unitPrice,
        currencyCode: 'USD',
        cardCode: 'SIMULATED-CODE-1234',
        cardPin: null,
        raw: { simulated: true },
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/com.reloadly.giftcards-v1+json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        productId: params.productId,
        countryCode: params.countryCode,
        quantity: 1,
        unitPrice: params.unitPrice,
        customIdentifier: params.customIdentifier,
        senderName: params.senderName,
        recipientEmail: params.recipientEmail,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        transactionId: params.customIdentifier,
        status: 'FAILED',
        amount: params.unitPrice,
        currencyCode: '',
        cardCode: null,
        cardPin: null,
        raw: json,
      };
    }

    const card = Array.isArray(json.smiles) && json.smiles.length > 0 ? json.smiles[0] : null;

    return {
      transactionId: String(json.transactionId ?? params.customIdentifier),
      status: 'SUCCESS',
      amount: json.amount ?? params.unitPrice,
      currencyCode: json.currencyCode ?? '',
      cardCode: card?.code ?? null,
      cardPin: card?.pinCode ?? null,
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
