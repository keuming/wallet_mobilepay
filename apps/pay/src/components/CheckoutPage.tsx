'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/apiClient';

const MOMO_PROVIDERS = [
  { id: 'orange', label: 'Orange Money' },
  { id: 'mtn', label: 'MTN MoMo' },
  { id: 'moov', label: 'Moov Money' },
  { id: 'wave', label: 'Wave' },
];

interface ResolvedTarget {
  businessName?: string;
  merchant?: { businessName: string };
  ownerUser?: { firstName: string; lastName: string };
  amount?: number | null;
  fixedAmount?: number | null;
  description?: string | null;
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

/**
 * Page de paiement publique (§ pay.mobilepay-ci.com) — accessible sans compte
 * MobilePay. Le client choisit soit de payer avec son solde MobilePay (s'il
 * en a un, redirection vers le wallet), soit avec un autre Mobile Money
 * (Orange/MTN/Moov/Wave), directement sur cette page sans connexion.
 */
export default function CheckoutPage({
  resolveEndpoint,
  payExternalEndpoint,
  walletAppUrl,
  walletAppQueryKey,
  walletAppPath = 'payer',
  mobilePaySubtitle = "J'ai déjà un compte MobilePay",
  identifier,
}: {
  resolveEndpoint: string;
  payExternalEndpoint: string;
  walletAppUrl: string;
  walletAppQueryKey: string;
  walletAppPath?: string;
  mobilePaySubtitle?: string;
  identifier: string;
}) {
  const [target, setTarget] = useState<ResolvedTarget | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<'choice' | 'external'>('choice');

  const [customerPhone, setCustomerPhone] = useState('');
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ResolvedTarget>(resolveEndpoint)
      .then(setTarget)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Introuvable.'));
  }, [resolveEndpoint]);

  const businessName =
    target?.merchant?.businessName ??
    target?.businessName ??
    (target?.ownerUser ? `${target.ownerUser.firstName} ${target.ownerUser.lastName}` : undefined);
  const fixedAmount = target?.fixedAmount ?? target?.amount ?? null;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ status: string }>(payExternalEndpoint, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          customerPhone,
          provider,
          amount: fixedAmount ? undefined : Math.round(Number(amount) * 100),
        }),
      });
      if (res.status === 'SUCCESS') {
        setResult({ status: 'success', message: 'Paiement confirmé ✓' });
      } else {
        setResult({
          status: 'pending',
          message: 'Vérifie ton téléphone et valide avec ton code Mobile Money pour finaliser le paiement.',
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec du paiement.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="mp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
          <p style={{ color: 'var(--mp-muted)' }}>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-header">
        <div className="mp-header-row" style={{ justifyContent: 'center' }}>
          <span className="mp-brand-mark">
            <span className="dot" />
            MobilePay CI
          </span>
        </div>
      </div>

      <div className="mp-balance-card" style={{ textAlign: 'center' }}>
        <div className="mp-balance-label">Paiement à</div>
        <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          {businessName ?? (target ? '—' : 'Chargement...')}
        </div>
        {fixedAmount ? (
          <div className="mp-balance-amount" style={{ marginTop: 10 }}>
            {fcfa(fixedAmount)}
            <span className="currency">FCFA</span>
          </div>
        ) : (
          target && <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 8 }}>Montant libre</div>
        )}
      </div>

      {target && mode === 'choice' && (
        <div className="mp-feature-list">
          <a
            href={walletAppPath === 'envoyer' ? `${walletAppUrl}/envoyer` : `${walletAppUrl}/${walletAppPath}?${walletAppQueryKey}=${identifier}`}
            className="mp-feature-card featured"
          >
            <div className="mp-feature-icon">💚</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">Payer avec MobilePay</div>
              <div className="mp-feature-sub">{mobilePaySubtitle}</div>
            </div>
            <div className="mp-feature-chevron">→</div>
          </a>
          <div className="mp-feature-card" onClick={() => setMode('external')}>
            <div className="mp-feature-icon">📱</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">Payer avec un autre Mobile Money</div>
              <div className="mp-feature-sub">Orange, MTN, Moov ou Wave — sans compte MobilePay</div>
            </div>
            <div className="mp-feature-chevron">→</div>
          </div>
        </div>
      )}

      {target && mode === 'external' && (
        <div className="mp-form">
          <button
            onClick={() => {
              setMode('choice');
              setResult(null);
              setError(null);
            }}
            className="mp-btn-ghost"
            style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12.5 }}
          >
            ← Retour
          </button>
          <input className="mp-input" placeholder="Ton numéro (+225...)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          <select className="mp-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Ton opérateur...</option>
            {MOMO_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {!fixedAmount && (
            <input className="mp-input" type="number" placeholder="Montant (FCFA)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
          {error && <div className="mp-error">{error}</div>}
          {result && (
            <div style={{ fontSize: 13, fontWeight: 600, color: result.status === 'success' ? 'var(--mp-green-dark)' : '#b8790a' }}>
              {result.message}
            </div>
          )}
          <button
            className="mp-btn-primary"
            disabled={submitting || !customerPhone || !provider || (!fixedAmount && !amount)}
            onClick={submit}
          >
            {submitting ? 'Envoi...' : 'Payer maintenant'}
          </button>
        </div>
      )}
    </div>
  );
}
