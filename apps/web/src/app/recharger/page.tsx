'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';
import StatusModal, { ResultStatus } from '../../components/StatusModal';
import PaymentMethodBadge, { PaymentMethodId } from '../../components/PaymentMethodBadge';
import { useAuth } from '../../contexts/AuthContext';
import { WORLD_COUNTRIES } from '../../lib/worldCountries';

interface Operator {
  operatorId: string;
  name: string;
  logoUrls: string[];
  data: boolean;
  denominationType: 'FIXED' | 'RANGE';
  destinationCurrencyCode: string;
  fixedAmounts: number[];
  localFixedAmounts: number[];
  minAmount: number | null;
  maxAmount: number | null;
  localMinAmount: number | null;
  localMaxAmount: number | null;
  supportsLocalAmounts: boolean;
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

const STEPS = ['Pays', 'Catégorie', 'Opérateur', 'Bénéficiaire', 'Paiement', 'Montant', 'Résumé'];



export default function RechargerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const [category, setCategory] = useState<Category | null>(null);
  const [country, setCountry] = useState('CI');
  const [operator, setOperator] = useState<Operator | null>(null);
  const [allOperators, setAllOperators] = useState<Operator[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [momoOperator, setMomoOperator] = useState<MomoOperator | null>(null);
  const [momoAccount, setMomoAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  // Suivi jusqu'au résultat final (§ correction sécurité) — un achat financé
  // par Mobile Money passe par HUB2, potentiellement avec OTP/USSD/lien à
  // confirmer, avant que Reloadly ne soit jamais appelé côté serveur.
  const [nextAction, setNextAction] = useState<{ type: 'ussd' | 'otp' | 'redirection'; message: string; url?: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpTransactionId, setOtpTransactionId] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  const pollTransactionStatus = (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~2 minutes — le temps que le client confirme réellement son paiement
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
          setNextAction(null);
          setResult({ status: 'success', message: `C'est fait ! ${CATEGORY_LABELS[category!].label} activé pour ${phone}. 🎉` });
        } else if (tx.status === 'FAILED') {
          clearInterval(interval);
          setNextAction(null);
          setResult({ status: 'failed', message: tx.failureReason ?? "L'achat n'a pas pu être finalisé." });
        } else if (tx.nextActionType && !nextAction) {
          setResult(null);
          if (tx.nextActionType === 'otp') setOtpTransactionId(transactionId);
          setNextAction({ type: tx.nextActionType, message: tx.nextActionMessage ?? '', url: tx.nextActionUrl });
        }
      } catch {
        // on retente au prochain tick
      }
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 2000);
  };

  const submitOtp = async () => {
    if (!otpTransactionId) return;
    setOtpSubmitting(true);
    try {
      await apiFetch(`/transactions/${otpTransactionId}/authenticate`, {
        method: 'POST',
        body: JSON.stringify({ confirmationCode: otpCode }),
      });
      setNextAction(null);
      setOtpCode('');
      pollTransactionStatus(otpTransactionId);
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : "Échec de l'authentification." });
    } finally {
      setOtpSubmitting(false);
    }
  };

  useEffect(() => {
    if (user?.country) setCountry(user.country);
  }, [user?.country]);

  useEffect(() => {
    apiFetch<{ cachedBalance: number }>('/wallet').then((w) => setWalletBalance(w.cachedBalance));
  }, []);

  useEffect(() => {
    setOperatorsLoading(true);
    apiFetch<Operator[]>(`/airtime/operators?country=${country}`)
      .then(setAllOperators)
      .finally(() => setOperatorsLoading(false));
  }, [country]);

  const kind = category ? CATEGORY_TO_KIND[category] : null;

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!country;
      case 1:
        return category !== null;
      case 2:
        return operator !== null;
      case 3:
        return phone.replace(/\D/g, '').length >= 8;
      case 4:
        if (paymentMethod === 'MOBILE_MONEY') return !!momoOperator && momoAccount.replace(/\D/g, '').length >= 8;
        return paymentMethod === 'WALLET';
      case 5:
        return !!amount && Number(amount) > 0;
      case 6:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await apiFetch<{ status?: string; id?: string }>('/airtime', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          phoneNumber: phone,
          amount: Math.round(Number(amount) * 100),
          kind,
          operatorId: operator?.operatorId,
          paymentMethod,
          momoProvider: paymentMethod === 'MOBILE_MONEY' ? momoOperator : undefined,
          countryCode: country,
        }),
      });

      if (response.status === 'SUCCESS') {
        setResult({ status: 'success', message: `C'est fait ! ${CATEGORY_LABELS[category!].label} activé pour ${phone}. 🎉` });
      } else if (response.status === 'PROCESSING' || response.status === 'PENDING') {
        if (response.id && paymentMethod === 'MOBILE_MONEY') {
          pollTransactionStatus(response.id);
          setResult({ status: 'pending', message: 'Vérification en cours...' });
        } else {
          setResult({ status: 'pending', message: 'Votre demande est en attente de confirmation.' });
        }
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
        {/* Étape 0 : Pays du destinataire */}
        {step === 0 && (
          <label>
            Pays du destinataire
            <select
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setOperator(null); // la liste d'opérateurs change avec le pays
              }}
            >
              {WORLD_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Étape 1 : Catégorie */}
        {step === 1 && (
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

        {/* Étape 2 : Opérateur télécom — logos quand la marque est reconnue */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {operatorsLoading && <p style={{ color: 'var(--mp-muted)', fontSize: 13.5 }}>Chargement des opérateurs...</p>}
            {!operatorsLoading && allOperators.length === 0 && (
              <p style={{ color: 'var(--mp-muted)', fontSize: 13.5 }}>Aucun opérateur disponible pour ce pays.</p>
            )}
            {allOperators
              .filter((o) => kind !== 'DATA' || o.data)
              .map((o) => {
                const logo = o.logoUrls?.[2] ?? o.logoUrls?.[0];
                return (
                  <button
                    key={o.operatorId}
                    onClick={() => setOperator(o)}
                    className={`mp-list-card ${operator?.operatorId === o.operatorId ? 'selected' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt={o.name} width={28} height={28} style={{ borderRadius: 7, objectFit: 'contain', background: 'var(--fz-surface)' }} />
                    ) : (
                      <span style={{ fontSize: 18 }}>📡</span>
                    )}
                    {o.name}
                  </button>
                );
              })}
          </div>
        )}

        {/* Étape 3 : Numéro bénéficiaire */}
        {step === 3 && (
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
        {step === 4 && (
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
        {step === 5 && (
          <div className="fz-amount-hero">
            {operator?.logoUrls?.[2] || operator?.logoUrls?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={operator.logoUrls[2] ?? operator.logoUrls[0]}
                alt={operator.name}
                style={{ width: 68, height: 68, borderRadius: 22, objectFit: 'contain', background: 'var(--fz-surface)', border: '1px solid var(--fz-border)' }}
              />
            ) : (
              <span className="fz-amount-avatar">{operator?.name.charAt(0).toUpperCase()}</span>
            )}
            <div>
              <div className="fz-amount-name">{operator?.name}</div>
              <div className="fz-amount-sub">{phone}</div>
            </div>

            {operator?.denominationType === 'FIXED' && operator.localFixedAmounts.length > 0 ? (
              <div className="fz-amount-chips">
                {operator.localFixedAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className={`fz-amount-chip ${amount === String(preset) ? 'selected' : ''}`}
                  >
                    {preset.toLocaleString('fr-FR')} {operator.destinationCurrencyCode}
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
                  <span className="fz-amount-currency">{operator?.destinationCurrencyCode ?? 'FCFA'}</span>
                </div>
                {operator?.denominationType === 'RANGE' && operator.localMinAmount != null && operator.localMaxAmount != null && (
                  <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)', margin: 0 }}>
                    Entre {operator.localMinAmount.toLocaleString('fr-FR')} et {operator.localMaxAmount.toLocaleString('fr-FR')} {operator.destinationCurrencyCode}
                  </p>
                )}
              </>
            )}

            {walletBalance !== null && paymentMethod === 'WALLET' && (
              <div className="fz-balance-badge">
                <span className="dot" />
                <span className="label">Solde :</span>
                <span className="value">{(walletBalance / 100).toLocaleString('fr-FR')} FCFA</span>
              </div>
            )}
          </div>
        )}

        {/* Étape 6 : Résumé */}
        {step === 6 && category && (
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
                <span className="k">Pays</span>
                <span className="v">{WORLD_COUNTRIES.find((c) => c.code === country)?.name}</span>
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

        {step !== STEPS.length - 1 && (
          <button className="mp-btn-primary" disabled={!canGoNext()} onClick={goNext}>
            Suivant
          </button>
        )}
      </div>

      {nextAction?.type === 'ussd' && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div className="mp-success" style={{ textAlign: 'left' }}>
            Vérifie ton téléphone et valide avec ton code Mobile Money pour finaliser l'achat.
          </div>
        </div>
      )}

      {nextAction?.type === 'otp' && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div style={{ background: 'rgba(184, 121, 10, 0.08)', border: '1px solid rgba(184, 121, 10, 0.2)', borderRadius: 14, padding: 14 }}>
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
          <div style={{ background: 'var(--mp-surface)', border: '1px solid var(--mp-border)', borderRadius: 14, padding: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--mp-muted)', margin: '0 0 10px' }}>Ouvre ce lien pour confirmer ton achat :</p>
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
