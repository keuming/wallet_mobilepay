'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';
import StatusModal, { ResultStatus } from '../../components/StatusModal';
import PaymentMethodBadge, { PaymentMethodId } from '../../components/PaymentMethodBadge';
import PasswordInput from '../../components/PasswordInput';
import { useAuth } from '../../contexts/AuthContext';

const COUNTRIES = [
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'SN', label: 'Sénégal' },
  { code: 'ML', label: 'Mali' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'BJ', label: 'Bénin' },
  { code: 'TG', label: 'Togo' },
  { code: 'NE', label: 'Niger' },
  { code: 'GW', label: 'Guinée-Bissau' },
  { code: 'CM', label: 'Cameroun' },
  { code: 'GA', label: 'Gabon' },
  { code: 'CG', label: 'Congo' },
  { code: 'TD', label: 'Tchad' },
  { code: 'CF', label: 'République Centrafricaine' },
  { code: 'GQ', label: 'Guinée Équatoriale' },
];

type Destination = 'MOBILEPAY' | 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN' | 'VISA' | 'VIREMENT';

const DESTINATIONS: Array<{ id: Destination; label: string; badge: PaymentMethodId | null; available: boolean }> = [
  { id: 'MOBILEPAY', label: 'Compte MobilePay', badge: 'MOBILEPAY', available: true },
  { id: 'ORANGE', label: 'Orange Money', badge: 'ORANGE', available: true },
  { id: 'MOOV', label: 'Moov Money', badge: 'MOOV', available: true },
  { id: 'WAVE', label: 'Wave', badge: 'WAVE', available: true },
  { id: 'MTN', label: 'MTN Money', badge: 'MTN', available: true },
  { id: 'VISA', label: 'Carte Visa', badge: 'VISA', available: false },
  { id: 'VIREMENT', label: 'Virement bancaire', badge: null, available: false },
];

const STEPS = ['Destination', 'Compte', 'Montant', 'Résumé', 'Code secret'];

export default function EnvoyerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [destCountry, setDestCountry] = useState('CI');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pin, setPin] = useState('');
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  useEffect(() => {
    apiFetch<{ hasPin: boolean }>('/auth/pin/status').then((res) => setHasPin(res.hasPin));
  }, []);

  useEffect(() => {
    if (user?.country) setDestCountry(user.country);
  }, [user?.country]);

  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return destination !== null;
      case 1:
        return accountNumber.replace(/\D/g, '').length >= 8;
      case 2:
        return !!amount && Number(amount) > 0;
      case 3:
        return true; // étape Résumé — validée par le clic sur "Continuer", pas de champ à remplir
      case 4:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const [pinError, setPinError] = useState<string | null>(null);

  const pollTransactionStatus = (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~2 minutes — un retrait HUB2 peut prendre un peu de temps
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const tx = await apiFetch<{ status: string; failureReason?: string }>(`/transactions/${transactionId}`);
        if (tx.status === 'SUCCESS') {
          clearInterval(interval);
          setResult({
            status: 'success',
            message: `Transfert réussi ! ${Number(amount).toLocaleString('fr-FR')} FCFA envoyés à ${destinationInfo?.label}. 🎉`,
          });
          setTimeout(() => router.push('/dashboard'), 2000);
        } else if (tx.status === 'FAILED') {
          clearInterval(interval);
          setResult({
            status: 'failed',
            message: tx.failureReason ?? "L'envoi n'a pas pu être finalisé. Aucun montant ne sera débité au-delà de la tentative.",
          });
          setTimeout(() => router.push('/dashboard'), 2500);
        }
      } catch {
        // on retente au prochain tick
      }
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 2000);
  };

  const handleSubmit = async () => {
    setError(null);
    setPinError(null);
    setSubmitting(true);
    try {
      let response: { status?: string; id?: string };
      if (destination === 'MOBILEPAY') {
        response = await apiFetch('/transfers', {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify({
            toPhone: accountNumber,
            amount: Math.round(Number(amount) * 100),
            pin,
            description: description || undefined,
          }),
        });
      } else {
        response = await apiFetch('/wallets/send-external', {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify({
            operator: destination,
            accountNumber,
            amount: Math.round(Number(amount) * 100),
            pin,
            country: destCountry,
          }),
        });
      }

      // Le statut réel renvoyé par le serveur détermine la couleur du modal —
      // un envoi vers un opérateur externe reste PROCESSING tant que HUB2 n'a
      // pas confirmé, ce n'est pas un succès immédiat comme un transfert MobilePay.
      if (response.status === 'SUCCESS') {
        setResult({
          status: 'success',
          message: `Transfert réussi ! ${Number(amount).toLocaleString('fr-FR')} FCFA envoyés à ${destinationInfo?.label}. 🎉`,
        });
        setTimeout(() => router.push('/dashboard'), 2000);
      } else if (response.status === 'PROCESSING' || response.status === 'PENDING' || response.status === 'INITIATED') {
        if (response.id) {
          pollTransactionStatus(response.id);
        }
        setResult({
          status: 'pending',
          message: 'Votre envoi a été transmis et est en attente de confirmation par l\'opérateur.',
        });
      } else if (response.status === 'FAILED' || response.status === 'CANCELLED' || response.status === 'EXPIRED') {
        setResult({ status: 'failed', message: 'L\'envoi n\'a pas pu être finalisé. Aucun montant ne sera débité au-delà de la tentative.' });
        setTimeout(() => router.push('/dashboard'), 2500);
      } else {
        // Réponse reçue mais sans statut exploitable — cas rare, on reste prudent.
        setResult({ status: 'unknown', message: 'La réponse du serveur est incomplète. Vérifiez votre historique pour confirmer l\'issue de cet envoi.' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) {
          // Code secret incorrect — on reste sur cette étape pour permettre
          // de ressaisir, plutôt que de rediriger comme pour un vrai échec
          // de transaction (fonds insuffisants, réseau, etc.).
          setPinError(err.message);
        } else {
          // Le serveur a répondu avec une erreur explicite (solde insuffisant,
          // destinataire introuvable...) — échec confirmé.
          setResult({ status: 'failed', message: err.message });
          setTimeout(() => router.push('/dashboard'), 2500);
        }
      } else {
        // Aucune réponse exploitable du tout (coupure réseau, timeout) — l'issue
        // réelle de la transaction est inconnue, distincte d'un échec confirmé.
        setResult({
          status: 'unknown',
          message: 'Impossible de contacter le serveur. Vérifiez votre connexion puis consultez votre historique avant de retenter.',
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

  const destinationInfo = DESTINATIONS.find((d) => d.id === destination);

  if (hasPin === false) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/dashboard" className="mp-back-link">
            ← Retour
          </Link>
          <h1>↗️ Transfert</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <p style={{ fontWeight: 700, color: 'var(--mp-navy)' }}>Code secret requis</p>
          <p style={{ color: 'var(--mp-muted)', fontSize: 13.5, marginBottom: 16 }}>
            Vous devez créer un code secret transactionnel avant de pouvoir envoyer de l'argent.
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
          <Link href="/dashboard" className="mp-back-link">
            ← Retour
          </Link>
        ) : (
          <button onClick={() => setStep((s) => s - 1)} className="mp-back-link">
            ← Précédent
          </button>
        )}
        <h1>↗️ Transfert</h1>
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
        {/* Étape 1 : Destination */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DESTINATIONS.map((d) => (
              <button
                key={d.id}
                disabled={!d.available}
                onClick={() => setDestination(d.id)}
                className={`mp-list-card ${destination === d.id ? 'selected' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                {d.badge ? (
                  <PaymentMethodBadge method={d.badge} size={26} />
                ) : (
                  <span style={{ fontSize: 18 }}>🏦</span>
                )}
                <span style={{ flex: 1 }}>{d.label}</span>
                {!d.available && (
                  <span style={{ fontSize: 10.5, color: 'var(--mp-muted)', fontWeight: 700 }}>Bientôt</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Étape 2 : Numéro de compte */}
        {step === 1 && (
          <>
            {destination !== 'MOBILEPAY' && (
              <label>
                Pays du destinataire
                <select
                  className="mp-input"
                  style={{ width: '100%', marginTop: 6, marginBottom: 14 }}
                  value={destCountry}
                  onChange={(e) => setDestCountry(e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Numéro de compte {destinationInfo?.label}
              <input
                className="mp-input"
                style={{ width: '100%', marginTop: 6 }}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="+2250700000000"
                autoFocus
              />
            </label>
          </>
        )}

        {/* Étape 3 : Montant */}
        {step === 2 && (
          <>
            <label>
              Montant (FCFA)
              <input
                className="mp-input"
                style={{ width: '100%', marginTop: 6 }}
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </label>
            {destination === 'MOBILEPAY' && (
              <label>
                Motif (optionnel)
                <input
                  className="mp-input"
                  style={{ width: '100%', marginTop: 6 }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            )}
          </>
        )}

        {/* Étape 4 : Résumé — contrôle final avant validation */}
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
                <span className="k">Destination</span>
                <span className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {destinationInfo?.badge && <PaymentMethodBadge method={destinationInfo.badge} size={18} />}
                  {destinationInfo?.label}
                </span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Numéro de compte</span>
                <span className="v">{accountNumber}</span>
              </div>
              {destination !== 'MOBILEPAY' && (
                <div className="mp-detail-row">
                  <span className="k">Pays</span>
                  <span className="v">{COUNTRIES.find((c) => c.code === destCountry)?.label}</span>
                </div>
              )}
              <div className="mp-detail-row">
                <span className="k">Montant</span>
                <span className="v" style={{ fontSize: 16, color: 'var(--mp-green-dark)' }}>
                  {Number(amount).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              {destination === 'MOBILEPAY' && description && (
                <div className="mp-detail-row">
                  <span className="k">Motif</span>
                  <span className="v">{description}</span>
                </div>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--mp-muted)', textAlign: 'center' }}>
              Cette opération est irréversible une fois validée avec votre code secret.
            </p>

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
              ✕ Annuler la transaction
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
                <span className="k">Destination</span>
                <span className="v">{destinationInfo?.label}</span>
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
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setPinError(null);
                }}
                placeholder="••••"
                autoFocus
              />
            </label>
            {pinError && <div className="mp-error">{pinError}</div>}
          </>
        )}

        {error && <div className="mp-error">{error}</div>}

        {step !== 3 && (
          <button className="mp-btn-primary" disabled={!canGoNext() || submitting} onClick={goNext}>
            {submitting ? 'Envoi...' : step === STEPS.length - 1 ? 'Valider et envoyer' : 'Suivant'}
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
