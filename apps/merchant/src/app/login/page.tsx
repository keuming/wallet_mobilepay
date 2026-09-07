'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';
import PasswordInput from '../../components/PasswordInput';

export default function LoginPage() {
  const { login, verifyLoginOtp } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
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
      const res = await login(phone, password);
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
      await verifyLoginOtp(phone, password, code);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mc-login-shell">
      <div className="mc-login-card">
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4, color: '#0f2d52' }}>
          Mobile<span style={{ color: '#00d27a' }}>Pay</span>
        </div>
        <div style={{ color: '#5a7a94', fontSize: 13, marginBottom: 24 }}>Dashboard Marchand</div>
        <form onSubmit={step === 'credentials' ? handleSubmit : handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 'credentials' ? (
            <>
              <label style={{ fontSize: 13, color: '#5a7a94' }}>
                Téléphone
                <input
                  className="mc-input"
                  style={{ width: '100%', marginTop: 4 }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label style={{ fontSize: 13, color: '#5a7a94' }}>
                Mot de passe
                <PasswordInput
                  className="mc-input"
                  style={{ marginTop: 4 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <div className="mc-error">{error}</div>}
              <button className="mc-btn" disabled={submitting} type="submit" style={{ marginTop: 8 }}>
                {submitting ? 'Connexion...' : 'Se connecter'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#5a7a94', margin: 0 }}>
                Pour confirmer que c'est bien toi, saisis le code envoyé par SMS au {maskedPhone}.
              </p>
              <label style={{ fontSize: 13, color: '#5a7a94' }}>
                Code de connexion
                <input
                  className="mc-input"
                  style={{ width: '100%', marginTop: 4, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoFocus
                />
              </label>
              {error && <div className="mc-error">{error}</div>}
              <button className="mc-btn" disabled={submitting || code.length < 4} type="submit" style={{ marginTop: 8 }}>
                {submitting ? 'Vérification...' : 'Confirmer et se connecter'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('credentials'); setCode(''); setError(null); }}
                style={{ background: 'none', border: 'none', color: '#5a7a94', fontSize: 12.5, cursor: 'pointer' }}
              >
                ← Retour
              </button>
            </>
          )}
        </form>
        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#5a7a94', opacity: 0.8, marginTop: 20, marginBottom: 0 }}>
          © {new Date().getFullYear()} ORZAYAH CI
        </p>
      </div>
    </div>
  );
}
