'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';
import PasswordInput from '../../components/PasswordInput';
import PhoneCountryInput from '../../components/PhoneCountryInput';

export default function LoginPage() {
  const { login, verifyLoginOtp } = useAuth();
  const router = useRouter();
  const [country, setCountry] = useState('CI');
  const [localNumber, setLocalNumber] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(localNumber, password, country);
      setMaskedPhone(res.maskedPhone);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyLoginOtp(localNumber, password, code, country);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-container mp-center-page">
      <div className="mp-header" style={{ paddingBottom: 14, borderRadius: '0 0 32px 32px' }}>
        <div className="mp-brand-mark">
          <span className="dot" />
          MobilePay CI
        </div>
        <h1>Bon retour parmi nous</h1>
        <p>{step === 'credentials' ? 'Connectez-vous pour accéder à votre wallet' : 'Dernière étape — vérification de sécurité'}</p>
      </div>

      {step === 'credentials' && (
        <form className="mp-form" style={{ paddingTop: 10 }} onSubmit={handleSubmit}>
          <PhoneCountryInput
            country={country}
            onCountryChange={setCountry}
            localNumber={localNumber}
            onLocalNumberChange={setLocalNumber}
          />
          <label>
            Mot de passe
            <PasswordInput
              className="mp-input"
              style={{ marginTop: 6 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" disabled={submitting} type="submit">
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
          <p style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)', textAlign: 'center' }}>
            Pas encore de compte ? <Link href="/inscription" style={{ color: 'var(--fz-accent)', fontWeight: 600 }}>Créer un compte</Link>
          </p>
        </form>
      )}

      {step === 'otp' && (
        <form className="mp-form" onSubmit={handleVerifyOtp}>
          <p style={{ fontSize: 13.5, color: 'var(--fz-text-secondary)', margin: 0 }}>
            Pour confirmer que c'est bien toi, saisis le code envoyé par SMS au {maskedPhone}.
          </p>
          <label>
            Code de connexion
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6, letterSpacing: 4, textAlign: 'center', fontSize: 20 }}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              inputMode="numeric"
              autoFocus
            />
          </label>
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" disabled={submitting || code.length < 4} type="submit">
            {submitting ? 'Vérification...' : 'Confirmer et se connecter'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('credentials'); setCode(''); setError(null); }}
            className="mp-btn-ghost"
            style={{ width: '100%' }}
          >
            ← Retour
          </button>
        </form>
      )}
    </div>
  );
}
