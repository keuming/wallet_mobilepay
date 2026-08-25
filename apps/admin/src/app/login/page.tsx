'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('+2250700000099');
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
    <div className="adm-login-shell">
      <div className="adm-login-card">
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
          Mobile<span style={{ color: '#3b82f6' }}>Pay</span> Admin
        </div>
        <div style={{ color: '#8a97b3', fontSize: 13, marginBottom: 24 }}>
          Back-office administrateur
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 13, color: '#8a97b3' }}>
            Téléphone
            <input
              className="adm-input"
              style={{ width: '100%', marginTop: 4 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13, color: '#8a97b3' }}>
            Mot de passe
            <input
              className="adm-input"
              style={{ width: '100%', marginTop: 4 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="adm-error">{error}</div>}
          <button className="adm-btn" disabled={submitting} type="submit" style={{ marginTop: 8 }}>
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
          <p style={{ fontSize: 11, color: '#8a97b3', marginTop: 4 }}>
            Compte admin de démo : +2250700000099 / Password123!
          </p>
        </form>
      </div>
    </div>
  );
}
