'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import StatusModal, { ResultStatus } from '../../../components/StatusModal';
import PasswordInput from '../../../components/PasswordInput';
import PaymentMethodBadge, { PaymentMethodId } from '../../../components/PaymentMethodBadge';

type Operator = 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

const MOBILE_MONEY_OPTIONS: Array<{ id: Operator; badge: PaymentMethodId; label: string }> = [
  { id: 'ORANGE', badge: 'ORANGE', label: 'Orange Money' },
  { id: 'MOOV', badge: 'MOOV', label: 'Moov Money' },
  { id: 'WAVE', badge: 'WAVE', label: 'Wave' },
  { id: 'MTN', badge: 'MTN', label: 'MTN Money' },
];

const CARD_OPTIONS: Array<{ badge: PaymentMethodId; label: string }> = [
  { badge: 'VISA', label: 'Visa' },
  { badge: 'MASTERCARD', label: 'Mastercard' },
];

const STEPS = ['Source', 'Compte', 'Montant', 'Résumé', 'Code secret'];

export default function RechargerWalletPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  // Action requise côté client (§ OTP/USSD/redirection) — découverte de
  // façon asynchrone via webhook, jamais dans la réponse immédiate.
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<{ type: 'ussd' | 'otp' | 'redirection'; message: string; url?: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ hasPin: boolean }>('/auth/pin/status').then((res) => setHasPin(res.hasPin));
  }, []);

  const pollTransactionStatus = (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~2 minutes — le client peut mettre du temps à valider (lien Wave, OTP...)
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const tx = await apiFetch<{
          status: string;
          nextActionType?: 'ussd' | 'otp' | 'redirection';
          nextActionMessage?: string;
          nextActionUrl?: string;
          failureReason?: string;
        }>(`/transactions/${transactionId}`);

        if (tx.status === 'SUCCESS') {
          clearInterval(interval);
          setPendingTransactionId(null);
          setNextAction(null);
          setResult({ status: 'success', message: `${Number(amount).toLocaleString('fr-FR')} FCFA ajoutés à votre wallet.` });
        } else if (tx.status === 'FAILED') {
          clearInterval(interval);
          setPendingTransactionId(null);
          setNextAction(null);
          setResult({ status: 'failed', message: tx.failureReason ?? "La recharge n'a pas pu être finalisée." });
        } else if (tx.nextActionType && !nextAction) {
          // On continue de surveiller (sans couper l'intervalle) — sinon le
          // vrai succès/échec, qui arrive plus tard via webhook, ne serait
          // jamais détecté et la fenêtre resterait ouverte indéfiniment.
          setResult(null);
          setNextAction({
            type: tx.nextActionType,
            message: tx.nextActionMessage ?? '',
            url: tx.nextActionUrl,
          });
        }
      } catch {
        // on retente au prochain tick
      }
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 2000);
  };

  const submitOtp = async () => {
    if (!pendingTransactionId) return;
    setOtpSubmitting(true);
    try {
      await apiFetch(`/transactions/${pendingTransactionId}/authenticate`, {
        method: 'POST',
        body: JSON.stringify({ confirmationCode: otpCode }),
      });
      setNextAction(null);
      setOtpCode('');
      pollTransactionStatus(pendingTransactionId);
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : "Échec de l'authentification." });
    } finally {
      setOtpSubmitting(false);
    }
  };

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return operator !== null;
      case 1:
        return accountNumber.replace(/\D/g, '').length >= 8;
      case 2:
        return !!amount && Number(amount) > 0;
      case 3:
        return true;
      case 4:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const selectedLabel = MOBILE_MONEY_OPTIONS.find((o) => o.id === operator)?.label;

  const handleSubmit = async () => {
    if (!operator) return;
    setSubmitting(true);
    try {
      const response = await apiFetch<{ status?: string; transactionId?: string }>('/wallets/topup', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          operator,
          accountNumber,
          amount: Math.round(Number(amount) * 100),
          pin,
        }),
      });

      if (response.status === 'SUCCESS') {
        setResult({ status: 'success', message: `${Number(amount).toLocaleString('fr-FR')} FCFA ajoutés à votre wallet.` });
      } else if (response.status === 'PROCESSING' || response.status === 'PENDING') {
        if (response.transactionId) {
          setPendingTransactionId(response.transactionId);
          pollTransactionStatus(response.transactionId);
        }
        setResult({
          status: 'pending',
          message: 'Vérification en cours...',
        });
      } else if (response.status === 'FAILED') {
        setResult({ status: 'failed', message: 'La recharge n\'a pas pu être finalisée.' });
      } else {
        setResult({ status: 'unknown', message: 'Réponse du serveur incomplète. Vérifiez votre historique.' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setResult({ status: 'failed', message: err.message });
      } else {
        setResult({
          status: 'unknown',
          message: 'Impossible de contacter le serveur. Vérifiez votre connexion puis consultez votre historique.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (step === STEPS.length - 1) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  };

  if (hasPin === false) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/recevoir" className="mp-back-link">
            ← Retour
          </Link>
          <h1>💰 Alimenter mon wallet</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <p style={{ fontWeight: 700, color: 'var(--mp-navy)' }}>Code secret requis</p>
          <p style={{ color: 'var(--mp-muted)', fontSize: 13.5, marginBottom: 16 }}>
            Créez votre code secret transactionnel avant de recharger votre wallet.
          </p>
          <Link href="/code-secret" className="mp-btn-primary" style={{ display: 'inline-block' }}>
            Créer mon code secret
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        {step === 0 ? (
          <Link href="/recevoir" className="mp-back-link">
            ← Retour
          </Link>
        ) : (
          <button onClick={() => setStep((s) => s - 1)} className="mp-back-link">
            ← Précédent
          </button>
        )}
        <h1>💰 Alimenter mon wallet</h1>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4, position: 'relative' }}>
          Étape {step + 1}/{STEPS.length} — {STEPS[step]}
        </div>
        <div className="mp-step-track">
          {STEPS.map((_, i) => (
            <div key={i} className={`mp-step-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>
      </div>

      <div className="mp-form">
        {/* Étape 1 : Source */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600 }}>MOBILE MONEY</div>
            {MOBILE_MONEY_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setOperator(o.id)}
                className={`mp-list-card ${operator === o.id ? 'selected' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <PaymentMethodBadge method={o.badge} size={28} />
                <span>{o.label}</span>
              </button>
            ))}
            <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600, marginTop: 6 }}>
              CARTE BANCAIRE
            </div>
            {CARD_OPTIONS.map((c) => (
              <button
                key={c.label}
                disabled
                className="mp-list-card"
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <PaymentMethodBadge method={c.badge} size={28} />
                <span style={{ flex: 1 }}>{c.label}</span>
                <span style={{ fontSize: 10.5, color: 'var(--mp-muted)', fontWeight: 700 }}>Bientôt</span>
              </button>
            ))}
          </div>
        )}

        {/* Étape 2 : Numéro de compte */}
        {step === 1 && (
          <label>
            Numéro de compte {selectedLabel}
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="+2250700000000"
              autoFocus
            />
          </label>
        )}

        {/* Étape 3 : Montant */}
        {step === 2 && (
          <label>
            Montant (FCFA)
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              type="number"
              min={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
        )}

        {/* Étape 4 : Résumé */}
        {step === 3 && (
          <>
            <div
              style={{
                background: 'var(--mp-surface)',
                border: '1.5px solid var(--mp-green)',
                borderRadius: 16,
                padding: '16px 18px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mp-green-dark)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                🔍 Vérifiez avant de continuer
              </div>
              <div className="mp-detail-row">
                <span className="k">Source</span>
                <span className="v">{selectedLabel}</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Numéro de compte</span>
                <span className="v">{accountNumber}</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Montant</span>
                <span className="v" style={{ fontSize: 16, color: 'var(--mp-green-dark)' }}>
                  {Number(amount).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
            <button className="mp-btn-primary" onClick={goNext}>
              ✅ Continuer vers la validation
            </button>
            <button className="mp-btn-ghost" onClick={() => setStep(0)}>
              ✏️ Modifier les informations
            </button>
            <button
              className="mp-btn-ghost"
              style={{ color: 'var(--mp-red)', borderColor: 'rgba(214, 69, 69, 0.25)' }}
              onClick={() => router.push('/dashboard')}
            >
              ✕ Annuler
            </button>
          </>
        )}

        {/* Étape 5 : Code secret */}
        {step === 4 && (
          <>
            <div
              style={{
                background: 'var(--mp-surface)',
                border: '1px solid var(--mp-border)',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 4,
              }}
            >
              <div className="mp-detail-row">
                <span className="k">Source</span>
                <span className="v">{selectedLabel}</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Montant</span>
                <span className="v">{Number(amount).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
            <label>
              Code secret
              <PasswordInput
                className="mp-input"
                style={{ marginTop: 6, letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
              />
            </label>
          </>
        )}

        {step !== 3 && (
          <button className="mp-btn-primary" disabled={!canGoNext() || submitting} onClick={goNext}>
            {submitting ? 'Envoi...' : step === STEPS.length - 1 ? 'Valider et recharger' : 'Suivant'}
          </button>
        )}
      </div>

      {nextAction?.type === 'ussd' && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div className="mp-success" style={{ textAlign: 'left' }}>
            Vérifie ton téléphone et valide avec ton code Mobile Money pour finaliser la recharge.
          </div>
        </div>
      )}

      {nextAction?.type === 'otp' && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div
            style={{
              background: 'rgba(184, 121, 10, 0.08)',
              border: '1px solid rgba(184, 121, 10, 0.2)',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <p style={{ fontSize: 12.5, color: '#8a5a06', margin: '0 0 10px' }}>{nextAction.message}</p>
            <input
              className="mp-input"
              style={{ width: '100%' }}
              placeholder="Code de confirmation"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
            />
            <button
              className="mp-btn-primary"
              style={{ marginTop: 8, width: '100%', background: 'linear-gradient(120deg, #b8790a 0%, #8a5a06 100%)' }}
              disabled={otpSubmitting || !otpCode}
              onClick={submitOtp}
            >
              {otpSubmitting ? 'Validation...' : 'Valider le code'}
            </button>
          </div>
        </div>
      )}

      {nextAction?.type === 'redirection' && nextAction.url && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div
            style={{
              background: 'var(--mp-surface)',
              border: '1px solid var(--mp-border)',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <p style={{ fontSize: 12.5, color: 'var(--mp-muted)', margin: '0 0 10px' }}>
              Ouvre ce lien pour confirmer ta recharge :
            </p>
            <a href={nextAction.url} target="_blank" rel="noreferrer" className="mp-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ouvrir le lien de confirmation
            </a>
          </div>
        </div>
      )}

      {result && (
        <StatusModal
          status={result.status}
          message={result.message}
          onClose={() => {
            setResult(null);
            if (result.status === 'success') router.push('/dashboard');
          }}
          actions={
            <>
              {result.status === 'success' && (
                <button className="mp-btn-primary" onClick={() => router.push('/historique')}>
                  Voir dans l'historique
                </button>
              )}
              <button className="mp-btn-ghost" onClick={() => router.push('/dashboard')}>
                Retour à l'accueil
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
