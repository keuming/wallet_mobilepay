'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(phone, password);
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
        <label>
          Téléphone
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2250700000000"
          />
        </label>
        <label>
          Mot de passe
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            type="password"
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
