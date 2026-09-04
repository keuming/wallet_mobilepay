'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { WORLD_COUNTRIES } from '../../lib/worldCountries';
import PasswordInput from '../../components/PasswordInput';

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
  type: BillType;
  localTransactionCurrencyCode: string;
  minLocalTransactionAmount: number | null;
  maxLocalTransactionAmount: number | null;
}

const STEPS = ['Pays', 'Type', 'Fournisseur', 'Compte', 'Montant', 'Résumé'];

export default function FacturesPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const [country, setCountry] = useState('CI');
  const [billType, setBillType] = useState<BillType | null>(null);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [billersLoading, setBillersLoading] = useState(false);
  const [biller, setBiller] = useState<Biller | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [pin, setPin] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: 'success' | 'failed'; message: string } | null>(null);

  useEffect(() => {
    if (user?.country) setCountry(user.country);
  }, [user?.country]);

  const [billersError, setBillersError] = useState<string | null>(null);

  useEffect(() => {
    if (!billType) return;
    setBillersLoading(true);
    setBillersError(null);
    apiFetch<Biller[]>(`/utility-payments/billers?country=${country}&type=${billType}`)
      .then(setBillers)
      .catch((err) => setBillersError(err instanceof ApiError ? err.message : 'Impossible de charger les fournisseurs.'))
      .finally(() => setBillersLoading(false));
    setBiller(null);
  }, [country, billType]);

  useEffect(() => {
    if (step !== 5 || !amount) return;
    setFeeLoading(true);
    apiFetch<{ feeAmount: string }>(`/pricing/preview?amount=${amount}`)
      .then((res) => setFeeAmount(Number(res.feeAmount)))
      .catch(() => setFeeAmount(null))
      .finally(() => setFeeLoading(false));
  }, [step, amount]);

  const canGoNext = (): boolean => {
    switch (step) {
      case 0: return !!country;
      case 1: return billType !== null;
      case 2: return biller !== null;
      case 3: return accountNumber.trim().length > 0;
      case 4: return !!amount && Number(amount) > 0;
      case 5: return pin.length >= 4;
      default: return false;
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
    if (!biller) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ status: string; failureReason?: string }>('/utility-payments/pay', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          billerId: biller.id,
          billerName: biller.name,
          billType: biller.type,
          subscriberAccountNumber: accountNumber,
          amount: Number(amount),
          pin,
        }),
      });
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

  if (result) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/dashboard" className="mp-back-link">← Retour</Link>
          <h1>🧾 Facture</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{result.status === 'success' ? '✅' : '❌'}</div>
          <p style={{ fontWeight: 700, color: 'var(--fz-text-primary)' }}>{result.message}</p>
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
        <h1>🧾 Payer une facture</h1>
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
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
              Choisis le pays du service à payer.
            </p>
            Pays
            <select className="mp-input" style={{ width: '100%', marginTop: 6 }} value={country} onChange={(e) => setCountry(e.target.value)}>
              {WORLD_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 4px' }}>
              Veuillez choisir le type de service à payer.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {BILL_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setBillType(t.id)}
                  className={`mp-list-card ${billType === t.id ? 'selected' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 16 }}
                >
                  <span style={{ fontSize: 26 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 4px' }}>
              Veuillez choisir le fournisseur exact du service.
            </p>
            {billersLoading && <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Chargement...</p>}
            {billersError && <div className="mp-error">{billersError}</div>}
            {!billersLoading && !billersError && billers.length === 0 && (
              <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Aucun fournisseur disponible pour ce pays/type.</p>
            )}
            {billers.map((b) => (
              <button
                key={b.id}
                onClick={() => setBiller(b)}
                className={`mp-list-card ${biller?.id === b.id ? 'selected' : ''}`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <label>
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
              Saisis le numéro de compte ou de compteur à payer.
            </p>
            Numéro de compte / compteur
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Numéro d'abonné"
              autoFocus
            />
          </label>
        )}

        {step === 4 && biller && (
          <div className="fz-amount-hero">
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 4px', textAlign: 'center' }}>
              Indique le montant à payer pour {biller.name}.
            </p>
            <span className="fz-amount-avatar">
              {BILL_TYPES.find((t) => t.id === billType)?.icon ?? '🧾'}
            </span>
            <div>
              <div className="fz-amount-name">{biller.name}</div>
              <div className="fz-amount-sub">{accountNumber}</div>
            </div>

            <div className="fz-amount-input-wrap">
              <input
                className="fz-amount-field"
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="fz-amount-currency">{biller.localTransactionCurrencyCode}</span>
            </div>
            {biller.minLocalTransactionAmount != null && biller.maxLocalTransactionAmount != null && (
              <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)', margin: 0 }}>
                Entre {biller.minLocalTransactionAmount.toLocaleString('fr-FR')} et {biller.maxLocalTransactionAmount.toLocaleString('fr-FR')}
              </p>
            )}
          </div>
        )}

        {step === 5 && biller && (
          <>
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
              Vérifie les détails, puis confirme le paiement avec ton code secret pour valider la transaction.
            </p>
            <div className="mp-detail-row"><span className="k">Objet</span><span className="v">Facture {biller.name}</span></div>
            <div className="mp-detail-row"><span className="k">Fournisseur</span><span className="v">{biller.name}</span></div>
            <div className="mp-detail-row"><span className="k">Compte</span><span className="v">{accountNumber}</span></div>
            <div className="mp-detail-row"><span className="k">Montant</span><span className="v">{Number(amount).toLocaleString('fr-FR')} {biller.localTransactionCurrencyCode}</span></div>
            <div className="mp-detail-row">
              <span className="k">Frais de transaction</span>
              <span className="v">
                {feeLoading ? '...' : feeAmount !== null ? `${(feeAmount / 100).toLocaleString('fr-FR')} FCFA` : '—'}
              </span>
            </div>
            <label style={{ display: 'block', marginTop: 16 }}>
              Code secret
              <PasswordInput className="mp-input" style={{ width: '100%', marginTop: 6 }} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" inputMode="numeric" />
            </label>
          </>
        )}

        <button className="mp-btn-primary" disabled={!canGoNext() || submitting} onClick={goNext} style={{ marginTop: 20 }}>
          {submitting ? 'Paiement en cours...' : step === STEPS.length - 1 ? 'Payer' : 'Suivant'}
        </button>
      </div>
    </div>
  );
}
