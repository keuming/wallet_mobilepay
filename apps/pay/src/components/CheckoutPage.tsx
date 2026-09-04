'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/apiClient';

const MOMO_PROVIDERS = [
  { id: 'orange', label: 'Orange Money', dialCode: '225' },
  { id: 'mtn', label: 'MTN MoMo', dialCode: '225' },
  { id: 'moov', label: 'Moov Money', dialCode: '225' },
  { id: 'wave', label: 'Wave', dialCode: '225' },
];

interface ResolvedTarget {
  businessName?: string;
  merchant?: { businessName: string };
  ownerUser?: { firstName: string; lastName: string };
  amount?: number | null;
  fixedAmount?: number | null;
  description?: string | null;
}

interface PaymentResponse {
  id: string;
  status: string;
  nextActionType?: string | null;
  nextActionMessage?: string | null;
  nextActionUrl?: string | null;
  failureReason?: string | null;
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

/**
 * Page de paiement publique (§ pay.mobilepay-ci.com) — accessible sans compte
 * MobilePay. Le client choisit soit de payer avec son solde MobilePay (s'il
 * en a un, redirection vers le wallet), soit avec un autre Mobile Money
 * (Orange/MTN/Moov/Wave), directement sur cette page sans connexion.
 *
 * § Corrigé : le parcours PAY-IN suit désormais réellement la confirmation
 * jusqu'au bout (sondage du statut, saisie du code OTP si l'opérateur
 * l'exige, message final clair) au lieu de rester sur un message statique
 * sans savoir si le paiement a vraiment abouti.
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

  const [localNumber, setLocalNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: 'pending' | 'otp' | 'success' | 'failed'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch<ResolvedTarget>(resolveEndpoint)
      .then(setTarget)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Introuvable.'));
  }, [resolveEndpoint]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const businessName =
    target?.merchant?.businessName ??
    target?.businessName ??
    (target?.ownerUser ? `${target.ownerUser.firstName} ${target.ownerUser.lastName}` : undefined);
  const fixedAmount = target?.fixedAmount ?? target?.amount ?? null;
  const dialCode = MOMO_PROVIDERS.find((p) => p.id === provider)?.dialCode ?? '225';

  const applyResponse = (res: PaymentResponse) => {
    setTransactionId(res.id);
    if (res.status === 'SUCCESS') {
      if (pollRef.current) clearInterval(pollRef.current);
      setResult({ status: 'success', message: 'Paiement confirmé ✓' });
    } else if (res.status === 'FAILED') {
      if (pollRef.current) clearInterval(pollRef.current);
      setResult({ status: 'failed', message: res.failureReason ?? "Le paiement n'a pas pu être finalisé." });
    } else if (res.nextActionType === 'otp') {
      if (pollRef.current) clearInterval(pollRef.current);
      setResult({
        status: 'otp',
        message: res.nextActionMessage ?? 'Saisis le code reçu par SMS pour confirmer.',
      });
    } else if (res.nextActionType === 'redirect' && res.nextActionUrl) {
      window.location.href = res.nextActionUrl;
    } else {
      setResult({
        status: 'pending',
        message: res.nextActionMessage ?? 'Vérifie ton téléphone et valide avec ton code Mobile Money pour finaliser le paiement.',
      });
    }
  };

  const startPolling = (id: string) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > 40) { // ~2 minutes à 3s d'intervalle
        if (pollRef.current) clearInterval(pollRef.current);
        setResult({ status: 'pending', message: "La confirmation prend plus de temps que prévu. Vérifie ton historique Mobile Money." });
        return;
      }
      try {
        const res = await apiFetch<PaymentResponse>(`/public/transactions/${id}/status`);
        applyResponse(res);
      } catch {
        // erreur réseau ponctuelle — on retente au prochain tick
      }
    }, 3000);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<PaymentResponse>(payExternalEndpoint, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          customerPhone: `+${dialCode}${localNumber.replace(/\D/g, '')}`,
          provider,
          amount: fixedAmount ? undefined : Math.round(Number(amount) * 100),
        }),
      });
      applyResponse(res);
      if (res.status !== 'SUCCESS' && res.status !== 'FAILED' && res.nextActionType !== 'otp') {
        startPolling(res.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec du paiement.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitOtp = async () => {
    if (!transactionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<PaymentResponse>(`/public/transactions/${transactionId}/authenticate`, {
        method: 'POST',
        body: JSON.stringify({ confirmationCode: otpCode }),
      });
      applyResponse(res);
      if (res.status !== 'SUCCESS' && res.status !== 'FAILED') {
        startPolling(transactionId);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="mp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
          <p style={{ color: 'var(--fz-text-secondary)' }}>{loadError}</p>
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

      {target && mode === 'choice' && !result && (
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

      {target && mode === 'external' && !result && (
        <div className="mp-form">
          <button
            onClick={() => { setMode('choice'); setError(null); }}
            className="mp-btn-ghost"
            style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12.5 }}
          >
            ← Retour
          </button>
          <select className="mp-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Ton opérateur...</option>
            {MOMO_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <span
              className="mp-input"
              style={{ width: 60, flexShrink: 0, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              +{dialCode}
            </span>
            <input
              className="mp-input"
              style={{ flex: 1 }}
              placeholder="0700000000"
              inputMode="tel"
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {!fixedAmount && (
            <input className="mp-input" type="number" placeholder="Montant (FCFA)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
          {error && <div className="mp-error">{error}</div>}
          <button
            className="mp-btn-primary"
            disabled={submitting || !localNumber || !provider || (!fixedAmount && !amount)}
            onClick={submit}
          >
            {submitting ? 'Envoi...' : 'Payer maintenant'}
          </button>
        </div>
      )}

      {result && (
        <div className="mp-form" style={{ textAlign: 'center' }}>
          {result.status === 'otp' ? (
            <>
              <p style={{ fontSize: 13.5, color: 'var(--fz-text-secondary)' }}>{result.message}</p>
              <input
                className="mp-input"
                placeholder="Code reçu par SMS"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              {error && <div className="mp-error">{error}</div>}
              <button className="mp-btn-primary" disabled={submitting || otpCode.length < 4} onClick={submitOtp}>
                {submitting ? 'Vérification...' : 'Confirmer le code'}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40, marginBottom: 8 }}>
                {result.status === 'success' ? '✅' : result.status === 'failed' ? '❌' : '⏳'}
              </div>
              <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--fz-text-primary)' }}>{result.message}</p>
              {result.status === 'failed' && (
                <button
                  className="mp-btn-primary"
                  onClick={() => { setResult(null); setMode('external'); setError(null); }}
                >
                  Réessayer
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
