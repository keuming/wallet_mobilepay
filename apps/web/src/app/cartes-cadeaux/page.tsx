'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { WORLD_COUNTRIES } from '../../lib/worldCountries';
import PasswordInput from '../../components/PasswordInput';

interface GiftCardProduct {
  productId: number;
  productName: string;
  brandName: string;
  logoUrl: string | null;
  denominationType: 'FIXED' | 'RANGE';
  fixedRecipientDenominations: number[];
  minRecipientDenomination: number | null;
  maxRecipientDenomination: number | null;
  recipientCurrencyCode: string;
}

const STEPS = ['Pays', 'Carte', 'Montant', 'Bénéficiaire', 'Résumé'];

export default function CartesCadeauxPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const [country, setCountry] = useState('CI');
  const [products, setProducts] = useState<GiftCardProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [product, setProduct] = useState<GiftCardProduct | null>(null);
  const [amount, setAmount] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [pin, setPin] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    status: 'success' | 'failed';
    message: string;
    cardCode?: string;
    cardPin?: string;
  } | null>(null);

  const [productsError, setProductsError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.country) setCountry(user.country);
  }, [user?.country]);

  useEffect(() => {
    setProductsLoading(true);
    setProductsError(null);
    apiFetch<GiftCardProduct[]>(`/gift-cards/products?country=${country}`)
      .then(setProducts)
      .catch((err) => setProductsError(err instanceof ApiError ? err.message : 'Impossible de charger le catalogue.'))
      .finally(() => setProductsLoading(false));
    setProduct(null);
  }, [country]);

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!country;
      case 1:
        return product !== null;
      case 2:
        return !!amount && Number(amount) > 0;
      case 3:
        return /\S+@\S+\.\S+/.test(recipientEmail);
      case 4:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (step === STEPS.length - 1) {
      handleSubmit();
    } else {
      setStep(step + 1);
    }
  };

  const handleSubmit = async () => {
    if (!product) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ status: string; failureReason?: string; cardCode?: string; cardPin?: string }>('/gift-cards/orders', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          productId: product.productId,
          unitPrice: Number(amount),
          recipientEmail,
          pin,
          countryCode: country,
        }),
      });
      if (res.status === 'SUCCESS') {
        setResult({
          status: 'success',
          message: `Carte cadeau ${product.brandName} envoyée ! 🎉`,
          cardCode: res.cardCode,
          cardPin: res.cardPin,
        });
      } else {
        setResult({ status: 'failed', message: res.failureReason ?? "L'achat n'a pas pu être finalisé." });
      }
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : "Échec de l'achat." });
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/dashboard" className="mp-back-link">← Retour</Link>
          <h1>🎁 Carte cadeau</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{result.status === 'success' ? '✅' : '❌'}</div>
          <p style={{ fontWeight: 700, color: 'var(--fz-text-primary)' }}>{result.message}</p>
          {result.cardCode && (
            <div style={{ background: 'var(--mp-surface)', border: '1px solid var(--mp-border)', borderRadius: 14, padding: 16, marginTop: 16, textAlign: 'left' }}>
              <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)', margin: '0 0 4px' }}>Code de la carte</p>
              <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'monospace', margin: '0 0 12px' }}>{result.cardCode}</p>
              {result.cardPin && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)', margin: '0 0 4px' }}>Code PIN</p>
                  <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'monospace', margin: 0 }}>{result.cardPin}</p>
                </>
              )}
              <p style={{ fontSize: 11.5, color: 'var(--fz-text-secondary)', marginTop: 12 }}>
                Ce code a aussi été envoyé à {recipientEmail}. Conserve-le précieusement.
              </p>
            </div>
          )}
          <Link href="/dashboard" className="mp-btn-primary" style={{ display: 'block', marginTop: 20, textDecoration: 'none' }}>
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">← Retour</Link>
        <h1>🎁 Carte cadeau</h1>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Étape {step + 1}/{STEPS.length} — {STEPS[step]}</div>
        <div className="mp-step-track">
          {STEPS.map((_, i) => (
            <div key={i} className={`mp-step-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>
      </div>

      <div className="mp-form">
        {step === 0 && (
          <label>
            Pays de la carte cadeau
            <select className="mp-input" style={{ width: '100%', marginTop: 6 }} value={country} onChange={(e) => setCountry(e.target.value)}>
              {WORLD_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {productsLoading && <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Chargement du catalogue...</p>}
            {productsError && <div className="mp-error">{productsError}</div>}
            {!productsLoading && !productsError && products.length === 0 && (
              <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Aucune carte cadeau disponible pour ce pays.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {products.map((p) => (
                <button
                  key={p.productId}
                  onClick={() => setProduct(p)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '10px 6px', borderRadius: 12,
                    border: product?.productId === p.productId ? '2px solid var(--fz-accent)' : '1px solid var(--fz-border)',
                    background: product?.productId === p.productId ? 'color-mix(in srgb, var(--fz-accent) 10%, transparent)' : 'var(--fz-surface)',
                    cursor: 'pointer',
                  }}
                >
                  {p.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logoUrl} alt={p.brandName} width={40} height={40} style={{ objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 22 }}>🎁</span>
                  )}
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fz-text-primary)', textAlign: 'center' }}>{p.brandName}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && product && (
          <div className="fz-amount-hero">
            {product.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.logoUrl}
                alt={product.brandName}
                style={{ width: 68, height: 68, borderRadius: 22, objectFit: 'contain', background: 'var(--fz-surface)', border: '1px solid var(--fz-border)' }}
              />
            ) : (
              <span className="fz-amount-avatar">🎁</span>
            )}
            <div>
              <div className="fz-amount-name">{product.brandName}</div>
              <div className="fz-amount-sub">Carte cadeau</div>
            </div>

            {product.denominationType === 'FIXED' && product.fixedRecipientDenominations.length > 0 ? (
              <div className="fz-amount-chips">
                {product.fixedRecipientDenominations.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className={`fz-amount-chip ${amount === String(preset) ? 'selected' : ''}`}
                  >
                    {preset.toLocaleString('fr-FR')} {product.recipientCurrencyCode}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="fz-amount-input-wrap">
                  <input
                    className="fz-amount-field"
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <span className="fz-amount-currency">{product.recipientCurrencyCode}</span>
                </div>
                {product.minRecipientDenomination != null && product.maxRecipientDenomination != null && (
                  <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)', margin: 0 }}>
                    Entre {product.minRecipientDenomination} et {product.maxRecipientDenomination} {product.recipientCurrencyCode}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <label>
            Email du bénéficiaire
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="destinataire@email.com"
              autoFocus
            />
            <p style={{ fontSize: 11.5, color: 'var(--fz-text-secondary)', marginTop: 6 }}>
              Le code de la carte sera envoyé à cette adresse — vérifie qu'elle est correcte.
            </p>
          </label>
        )}

        {step === 4 && product && (
          <>
            <div className="mp-detail-row">
              <span className="k">Carte</span>
              <span className="v">{product.brandName}</span>
            </div>
            <div className="mp-detail-row">
              <span className="k">Montant</span>
              <span className="v">{Number(amount).toLocaleString('fr-FR')} {product.recipientCurrencyCode}</span>
            </div>
            <div className="mp-detail-row">
              <span className="k">Bénéficiaire</span>
              <span className="v">{recipientEmail}</span>
            </div>
            <label style={{ display: 'block', marginTop: 16 }}>
              Code secret
              <PasswordInput
                className="mp-input"
                style={{ width: '100%', marginTop: 6 }}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                inputMode="numeric"
              />
            </label>
          </>
        )}

        <button className="mp-btn-primary" disabled={!canGoNext() || submitting} onClick={goNext} style={{ marginTop: 20 }}>
          {submitting ? 'Achat en cours...' : step === STEPS.length - 1 ? 'Confirmer l\'achat' : 'Suivant'}
        </button>
      </div>
    </div>
  );
}
