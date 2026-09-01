'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import PasswordInput from '../../components/PasswordInput';

/**
 * Carte de création de compte (§ premier écran après installation de
 * l'app) — en 3 étapes : vérification du numéro par OTP (évite les comptes
 * créés avec un numéro mal saisi), puis code PIN unique (connexion et
 * transactions), puis informations personnelles.
 */
export default function InscriptionPage() {
  const { registerWithPin } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'phone' | 'otp' | 'details'>('phone');

  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sendOtp = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/phone/send-otp', { method: 'POST', auth: false, body: JSON.stringify({ phone }) });
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'envoi du code.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/phone/verify-otp', { method: 'POST', auth: false, body: JSON.stringify({ phone, code: otpCode }) });
      setStep('details');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code incorrect.');
    } finally {
      setSubmitting(false);
    }
  };

  const mismatch = confirmPin.length > 0 && pin !== confirmPin;
  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    /^\d{4,6}$/.test(pin) &&
    pin === confirmPin;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await registerWithPin({ phone, firstName, lastName, email: email || undefined, pin });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer le compte.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-header" style={{ paddingBottom: 40, borderRadius: '0 0 32px 32px' }}>
        <div className="mp-brand-mark">
          <span className="dot" />
          MobilePay CI
        </div>
        <h1>Bienvenue 👋</h1>
        <p>Crée ton compte en quelques instants</p>
      </div>

      {step === 'phone' && (
        <div className="mp-form">
          <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
            On va d'abord vérifier ton numéro par SMS, pour être sûr qu'il est bien saisi.
          </p>
          <label>
            Numéro de téléphone
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2250700000000"
              autoFocus
            />
          </label>
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" disabled={submitting || !phone} onClick={sendOtp}>
            {submitting ? 'Envoi...' : 'Envoyer le code'}
          </button>
          <p style={{ fontSize: 12.5, color: 'var(--mp-muted)', textAlign: 'center' }}>
            Déjà un compte ? <Link href="/login" style={{ color: 'var(--mp-green-dark)', fontWeight: 600 }}>Se connecter</Link>
          </p>
        </div>
      )}

      {step === 'otp' && (
        <div className="mp-form">
          <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
            Code envoyé au {phone}. Saisis-le ci-dessous.
          </p>
          <input
            className="mp-input"
            style={{ width: '100%', letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            autoFocus
          />
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" disabled={submitting || otpCode.length < 4} onClick={verifyOtp}>
            {submitting ? 'Vérification...' : 'Vérifier le code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setOtpCode('');
              setError(null);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--mp-muted)', fontSize: 12.5, textAlign: 'center', cursor: 'pointer' }}
          >
            ← Changer de numéro
          </button>
        </div>
      )}

      {step === 'details' && (
        <form className="mp-form" onSubmit={handleSubmit}>
          <label>
            Nom
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Kouassi"
              autoFocus
            />
          </label>
          <label>
            Prénoms
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jean"
            />
          </label>
          <label>
            Adresse email <span style={{ color: 'var(--mp-muted)', fontWeight: 400 }}>(optionnel)</span>
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean@exemple.com"
            />
          </label>
          <label>
            Code PIN <span style={{ color: 'var(--mp-muted)', fontWeight: 400 }}>(4 à 6 chiffres — connexion et transactions)</span>
            <PasswordInput
              className="mp-input"
              style={{ marginTop: 6 }}
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </label>
          <label>
            Confirme ton code PIN
            <PasswordInput
              className="mp-input"
              style={{ marginTop: 6 }}
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </label>
          {mismatch && <div className="mp-error">Les deux codes PIN ne correspondent pas.</div>}
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" disabled={submitting || !canSubmit} type="submit">
            {submitting ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>
      )}
    </div>
  );
}
