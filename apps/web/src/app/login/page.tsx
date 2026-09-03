'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';
import PasswordInput from '../../components/PasswordInput';
import PhoneCountryInput from '../../components/PhoneCountryInput';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [country, setCountry] = useState('CI');
  const [localNumber, setLocalNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(localNumber, password, country);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
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
        <h1>Bon retour parmi nous</h1>
        <p>Connectez-vous pour accéder à votre wallet</p>
      </div>

      <form className="mp-form" onSubmit={handleSubmit}>
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
        <p style={{ fontSize: 12.5, color: 'var(--mp-muted)', textAlign: 'center' }}>
          Pas encore de compte ? <Link href="/inscription" style={{ color: 'var(--mp-green-dark)', fontWeight: 600 }}>Créer un compte</Link>
        </p>
      </form>
    </div>
  );
}
