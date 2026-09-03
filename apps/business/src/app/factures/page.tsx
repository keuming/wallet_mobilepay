'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import BusinessSideMenu from '../../components/BusinessSideMenu';
import { WORLD_COUNTRIES } from '../../lib/worldCountries';

type BillType = 'ELECTRICITY_BILL_PAYMENT' | 'WATER_BILL_PAYMENT' | 'TV_BILL_PAYMENT' | 'INTERNET_BILL_PAYMENT';

const BILL_TYPES: { id: BillType; label: string; icon: string }[] = [
  { id: 'ELECTRICITY_BILL_PAYMENT', label: 'Électricité', icon: '⚡' },
  { id: 'WATER_BILL_PAYMENT', label: 'Eau', icon: '💧' },
  { id: 'TV_BILL_PAYMENT', label: 'TV', icon: '📺' },
  { id: 'INTERNET_BILL_PAYMENT', label: 'Internet', icon: '🌐' },
];

interface Biller {
  id: number;
  name: string;
  localTransactionCurrencyCode: string;
  minLocalTransactionAmount: number | null;
  maxLocalTransactionAmount: number | null;
}

export default function FacturesBusinessPage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const [country, setCountry] = useState('CI');
  const [billType, setBillType] = useState<BillType | null>(null);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [billersError, setBillersError] = useState<string | null>(null);
  const [biller, setBiller] = useState<Biller | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: 'success' | 'failed'; message: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (activeMerchant?.country) setCountry(activeMerchant.country);
  }, [user, loading, router, activeMerchant?.country]);

  useEffect(() => {
    if (!billType || !activeMerchant?.merchantId) return;
    setBillersError(null);
    apiFetch<Biller[]>(`/merchants/${activeMerchant.merchantId}/utility-payments/billers?country=${country}&type=${billType}`)
      .then(setBillers)
      .catch((err) => setBillersError(err instanceof ApiError ? err.message : 'Impossible de charger les fournisseurs.'));
    setBiller(null);
  }, [country, billType, activeMerchant?.merchantId]);

  if (loading || !user || !activeMerchant) return null;

  const submit = async () => {
    if (!biller) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiFetch<{ status: string; failureReason?: string }>(
        `/merchants/${activeMerchant.merchantId}/utility-payments/pay`,
        {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify({
            billerId: biller.id,
            billerName: biller.name,
            billType,
            subscriberAccountNumber: accountNumber,
            amount: Number(amount),
          }),
        },
      );
      if (res.status === 'SUCCESS' || res.status === 'PROCESSING') {
        setResult({ status: 'success', message: `Facture ${biller.name} payée ! 🎉` });
      } else {
        setResult({ status: 'failed', message: res.failureReason ?? "Le paiement n'a pas pu être finalisé." });
      }
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'Échec du paiement.' });
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
        <h2 style={{ margin: 0 }}>🧾 Payer une facture</h2>

        <label>
          Pays
          <select className="mp-input" style={{ width: '100%', marginTop: 6 }} value={country} onChange={(e) => setCountry(e.target.value)}>
            {WORLD_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {BILL_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBillType(t.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 4px', borderRadius: 12,
                border: billType === t.id ? '2px solid var(--fz-accent)' : '1px solid var(--fz-border)',
                background: billType === t.id ? 'color-mix(in srgb, var(--fz-accent) 10%, transparent)' : 'var(--fz-surface)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fz-text-primary)' }}>{t.label}</span>
            </button>
          ))}
        </div>

        {billType && (
          <>
            {billersError && <div className="mp-error">{billersError}</div>}
            {!billersError && billers.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)' }}>Aucun fournisseur disponible pour ce pays/type.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {billers.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBiller(b)}
                  style={{
                    padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                    border: biller?.id === b.id ? '2px solid var(--fz-accent)' : '1px solid var(--fz-border)',
                    background: biller?.id === b.id ? 'color-mix(in srgb, var(--fz-accent) 10%, transparent)' : 'var(--fz-surface)',
                    color: 'var(--fz-text-primary)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </>
        )}

        {biller && (
          <>
            <label>
              Numéro de compte / compteur du client
              <input className="mp-input" style={{ width: '100%', marginTop: 6 }} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Numéro d'abonné" />
            </label>
            <label>
              Montant ({biller.localTransactionCurrencyCode})
              {biller.minLocalTransactionAmount != null && biller.maxLocalTransactionAmount != null && (
                <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)', margin: '4px 0 8px' }}>
                  Entre {biller.minLocalTransactionAmount.toLocaleString('fr-FR')} et {biller.maxLocalTransactionAmount.toLocaleString('fr-FR')}
                </p>
              )}
              <input className="mp-input" style={{ width: '100%', marginTop: 6 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant" />
            </label>
            <button className="mp-btn-primary" disabled={submitting || !accountNumber || !amount} onClick={submit}>
              {submitting ? 'Paiement en cours...' : 'Payer'}
            </button>
          </>
        )}

        {result && (
          <div
            style={{
              background: result.status === 'success' ? 'color-mix(in srgb, var(--fz-accent) 10%, transparent)' : 'rgba(214,69,69,.1)',
              border: `1px solid ${result.status === 'success' ? 'var(--fz-accent)' : '#d64545'}`,
              borderRadius: 10, padding: '10px 16px', fontSize: 13.5,
            }}
          >
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
