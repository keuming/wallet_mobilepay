'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('+2250700000001');
  const [password, setPassword] = useState('Password123!');
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
      <div className="mp-header">
        <h1 style={{ margin: 0, fontSize: 22 }}>MobilePay CI</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: 14 }}>Connexion à votre wallet</p>
      </div>
      <form className="mp-form" onSubmit={handleSubmit}>
        <label>
          Téléphone
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 4 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2250700000000"
          />
        </label>
        <label>
          Mot de passe
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 4 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="mp-error">{error}</div>}
        <button className="mp-btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Connexion...' : 'Se connecter'}
        </button>
        <p style={{ fontSize: 12, color: '#6b7280' }}>
          Compte de démo (après <code>prisma db seed</code>) : +2250700000001 / Password123!
        </p>
      </form>
    </div>
  );
}
