'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import BusinessSideMenu from '../../components/BusinessSideMenu';
import { WORLD_COUNTRIES } from '../../lib/worldCountries';

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

export default function CartesCadeauxBusinessPage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const [country, setCountry] = useState('CI');
  const [products, setProducts] = useState<GiftCardProduct[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [product, setProduct] = useState<GiftCardProduct | null>(null);
  const [amount, setAmount] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: 'success' | 'failed'; message: string; cardCode?: string; cardPin?: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (activeMerchant?.country) setCountry(activeMerchant.country);
  }, [user, loading, router, activeMerchant?.country]);

  useEffect(() => {
    setProductsError(null);
    apiFetch<GiftCardProduct[]>(`/merchants/${activeMerchant?.merchantId}/gift-cards/products?country=${country}`)
      .then(setProducts)
      .catch((err) => setProductsError(err instanceof ApiError ? err.message : 'Impossible de charger le catalogue.'));
    setProduct(null);
  }, [country, activeMerchant?.merchantId]);

  if (loading || !user || !activeMerchant) return null;

  const submit = async () => {
    if (!product) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiFetch<{ status: string; failureReason?: string; cardCode?: string; cardPin?: string }>(
        `/merchants/${activeMerchant.merchantId}/gift-cards/orders`,
        {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify({ productId: product.productId, unitPrice: Number(amount), recipientEmail, countryCode: country }),
        },
      );
      if (res.status === 'SUCCESS') {
        setResult({ status: 'success', message: `Carte cadeau ${product.brandName} envoyée ! 🎉`, cardCode: res.cardCode, cardPin: res.cardPin });
      } else {
        setResult({ status: 'failed', message: res.failureReason ?? "L'achat n'a pas pu être finalisé." });
      }
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : "Échec de l'achat." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-header">
        <div className="mp-header-row">
          <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">☰</button>
          <span className="mp-brand-mark"><span className="dot" />{activeMerchant.businessName}</span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">⏻</button>
        </div>
      </div>

      <BusinessSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-section" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0 }}>🎁 Cartes cadeaux</h2>

        <label>
          Pays de la carte
          <select className="mp-input" style={{ width: '100%', marginTop: 6 }} value={country} onChange={(e) => setCountry(e.target.value)}>
            {WORLD_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {products.map((p) => (
            <button
              key={p.productId}
              type="button"
              onClick={() => setProduct(p)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '10px 6px', borderRadius: 12,
                border: product?.productId === p.productId ? '2px solid var(--mp-green)' : '1px solid var(--mp-border, #e2e8e5)',
                background: product?.productId === p.productId ? 'rgba(71,182,134,.08)' : 'white',
                cursor: 'pointer',
              }}
            >
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logoUrl} alt={p.brandName} width={36} height={36} style={{ objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 20 }}>🎁</span>
              )}
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fz-text-primary)', textAlign: 'center' }}>{p.brandName}</span>
            </button>
          ))}
        </div>
        {productsError && <div className="mp-error">{productsError}</div>}
        {!productsError && products.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)' }}>Aucune carte cadeau disponible pour ce pays.</p>}

        {product && (
          <>
            <label>
              Montant ({product.recipientCurrencyCode})
              {product.denominationType === 'FIXED' && product.fixedRecipientDenominations.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
                  {product.fixedRecipientDenominations.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className="mp-action-btn"
                      style={{
                        color: amount === String(preset) ? 'white' : 'var(--fz-text-primary)',
                        background: amount === String(preset) ? 'var(--fz-text-primary)' : 'var(--mp-surface)',
                        border: '1px solid var(--mp-border)',
                      }}
                    >
                      {preset.toLocaleString('fr-FR')}
                    </button>
                  ))}
                </div>
              ) : (
                <input className="mp-input" style={{ width: '100%', marginTop: 6 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant" />
              )}
            </label>

            <label>
              Email du bénéficiaire
              <input
                className="mp-input"
                style={{ width: '100%', marginTop: 6 }}
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@email.com"
              />
            </label>

            <button className="mp-btn-primary" disabled={submitting || !amount || !recipientEmail} onClick={submit}>
              {submitting ? 'Achat en cours...' : "Confirmer l'achat"}
            </button>
          </>
        )}

        {result && (
          <div
            style={{
              background: result.status === 'success' ? 'rgba(71,182,134,.1)' : 'rgba(214,69,69,.1)',
              border: `1px solid ${result.status === 'success' ? 'var(--mp-green)' : '#d64545'}`,
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13.5,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>{result.message}</p>
            {result.cardCode && (
              <div style={{ marginTop: 8, fontFamily: 'monospace' }}>
                <div>Code : <strong>{result.cardCode}</strong></div>
                {result.cardPin && <div>PIN : <strong>{result.cardPin}</strong></div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
