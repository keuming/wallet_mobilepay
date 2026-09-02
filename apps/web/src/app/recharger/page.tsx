'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';
import StatusModal, { ResultStatus } from '../../components/StatusModal';
import PaymentMethodBadge, { PaymentMethodId } from '../../components/PaymentMethodBadge';
import { useAuth } from '../../contexts/AuthContext';

interface Operator {
  operatorId: string;
  name: string;
  supportsData: boolean;
}

type Category = 'AIRTIME' | 'CALL_PASS' | 'DATA_PASS' | 'INTERNET';
// Catégories visibles par l'utilisateur, mappées vers les 2 types réels
// gérés côté backend (AIRTIME|DATA) — Reloadly ne distingue pas plus finement
// en mode simulé, mais l'UI reflète les 4 offres commerciales usuelles.
const CATEGORY_TO_KIND: Record<Category, 'AIRTIME' | 'DATA'> = {
  AIRTIME: 'AIRTIME',
  CALL_PASS: 'AIRTIME',
  DATA_PASS: 'DATA',
  INTERNET: 'DATA',
};
const CATEGORY_LABELS: Record<Category, { label: string; icon: string }> = {
  AIRTIME: { label: 'Crédit de communication', icon: '📞' },
  CALL_PASS: { label: 'Pass appel', icon: '☎️' },
  DATA_PASS: { label: 'Pass internet', icon: '📶' },
  INTERNET: { label: 'Internet', icon: '🌐' },
};

type PaymentMethod = 'WALLET' | 'MOBILE_MONEY';
type MomoOperator = 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

const MOMO_OPTIONS: Array<{ id: MomoOperator; badge: PaymentMethodId; label: string }> = [
  { id: 'ORANGE', badge: 'ORANGE', label: 'Orange Money' },
  { id: 'MOOV', badge: 'MOOV', label: 'Moov Money' },
  { id: 'WAVE', badge: 'WAVE', label: 'Wave' },
  { id: 'MTN', badge: 'MTN', label: 'MTN Money' },
];

const STEPS = ['Catégorie', 'Opérateur', 'Bénéficiaire', 'Paiement', 'Montant', 'Résumé'];

export default function RechargerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const [category, setCategory] = useState<Category | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [allOperators, setAllOperators] = useState<Operator[]>([]);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [momoOperator, setMomoOperator] = useState<MomoOperator | null>(null);
  const [momoAccount, setMomoAccount] = useState('');
  const [amount, setAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  useEffect(() => {
    apiFetch<Operator[]>(`/airtime/operators?country=${user?.country ?? 'CI'}`).then(setAllOperators);
  }, [user?.country]);

  const kind = category ? CATEGORY_TO_KIND[category] : null;
  const presetAmounts = kind === 'DATA' ? [1000, 2500, 5000, 10000] : [500, 1000, 2000, 5000];

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return category !== null;
      case 1:
        return operator !== null;
      case 2:
        return phone.replace(/\D/g, '').length >= 8;
      case 3:
        if (paymentMethod === 'MOBILE_MONEY') return !!momoOperator && momoAccount.replace(/\D/g, '').length >= 8;
        return paymentMethod === 'WALLET';
      case 4:
        return !!amount && Number(amount) > 0;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await apiFetch<{ status?: string }>('/airtime', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          phoneNumber: phone,
          amount: Math.round(Number(amount) * 100),
          kind,
          operatorId: operator?.operatorId,
          paymentMethod,
          momoProvider: paymentMethod === 'MOBILE_MONEY' ? momoOperator : undefined,
          countryCode: user?.country ?? 'CI',
        }),
      });

      if (response.status === 'SUCCESS') {
        setResult({ status: 'success', message: `${CATEGORY_LABELS[category!].label} activé pour ${phone}.` });
      } else if (response.status === 'PROCESSING' || response.status === 'PENDING') {
        setResult({ status: 'pending', message: 'Votre demande est en attente de confirmation.' });
      } else if (response.status === 'FAILED') {
        setResult({ status: 'failed', message: 'L\'achat n\'a pas pu être finalisé.' });
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

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        {step === 0 ? (
          <Link href="/dashboard" className="mp-back-link">
            ← Retour
          </Link>
        ) : (
          <button onClick={() => setStep((s) => s - 1)} className="mp-back-link">
            ← Précédent
          </button>
        )}
        <h1>📶 Crédit & Data</h1>
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
        {/* Étape 1 : Catégorie */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`mp-list-card ${category === c ? 'selected' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span style={{ fontSize: 18 }}>{CATEGORY_LABELS[c].icon}</span>
                <span>{CATEGORY_LABELS[c].label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Étape 2 : Opérateur télécom */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allOperators
              .filter((o) => kind !== 'DATA' || o.supportsData)
              .map((o) => (
                <button
                  key={o.operatorId}
                  onClick={() => setOperator(o)}
                  className={`mp-list-card ${operator?.operatorId === o.operatorId ? 'selected' : ''}`}
                >
                  {o.name}
                </button>
              ))}
          </div>
        )}

        {/* Étape 3 : Numéro bénéficiaire */}
        {step === 2 && (
          <label>
            Numéro du bénéficiaire ({operator?.name})
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2250700000000"
              autoFocus
            />
          </label>
        )}

        {/* Étape 4 : Mode de paiement */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => setPaymentMethod('WALLET')}
              className={`mp-list-card ${paymentMethod === 'WALLET' ? 'selected' : ''}`}
            >
              💰 Solde MobilePay
            </button>
            <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600, marginTop: 4 }}>
              MOBILE MONEY
            </div>
            {MOMO_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setPaymentMethod('MOBILE_MONEY');
                  setMomoOperator(o.id);
                }}
                className={`mp-list-card ${paymentMethod === 'MOBILE_MONEY' && momoOperator === o.id ? 'selected' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <PaymentMethodBadge method={o.badge} size={26} />
                <span>{o.label}</span>
              </button>
            ))}
            {paymentMethod === 'MOBILE_MONEY' && (
              <input
                className="mp-input"
                style={{ width: '100%' }}
                value={momoAccount}
                onChange={(e) => setMomoAccount(e.target.value)}
                placeholder="Numéro Mobile Money"
              />
            )}
          </div>
        )}

        {/* Étape 5 : Montant */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600, marginBottom: 8 }}>
              Montant (FCFA)
            </div>
            <div className="mp-preset-grid" style={{ marginBottom: 10 }}>
              {presetAmounts.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={`mp-preset-chip ${amount === String(preset) ? 'selected' : ''}`}
                >
                  {preset.toLocaleString('fr-FR')}
                </button>
              ))}
            </div>
            <input
              className="mp-input"
              style={{ width: '100%' }}
              type="number"
              placeholder="Ou montant libre"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        )}

        {/* Étape 6 : Résumé */}
        {step === 5 && category && (
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
                <span className="k">Catégorie</span>
                <span className="v">{CATEGORY_LABELS[category].label}</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Bénéficiaire</span>
                <span className="v">{phone} ({operator?.name})</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Paiement</span>
                <span className="v">
                  {paymentMethod === 'WALLET' ? 'Solde MobilePay' : MOMO_OPTIONS.find((o) => o.id === momoOperator)?.label}
                </span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Montant</span>
                <span className="v" style={{ fontSize: 16, color: 'var(--mp-green-dark)' }}>
                  {Number(amount).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
            <button className="mp-btn-primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Envoi...' : '✅ Confirmer et acheter'}
            </button>
            <button className="mp-btn-ghost" onClick={() => setStep(0)}>
              ✏️ Modifier
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

        {step !== 5 && (
          <button className="mp-btn-primary" disabled={!canGoNext()} onClick={goNext}>
            Suivant
          </button>
        )}
      </div>

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
