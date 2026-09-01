'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="mc-login-shell">
      <div className="mc-login-card">
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4, color: '#0f2d52' }}>
          Mobile<span style={{ color: '#0a8f58' }}>Pay</span>
        </div>
        <div style={{ color: '#5a7a94', fontSize: 13, marginBottom: 24 }}>Dashboard Marchand</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <input
              className="mc-input"
              style={{ width: '100%', marginTop: 4 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="mc-error">{error}</div>}
          <button className="mc-btn" disabled={submitting} type="submit" style={{ marginTop: 8 }}>
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
