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
    <div
      className="mp-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #16345f 0%, #0f2d52 55%, #065f3c 130%)',
        maxWidth: '100%',
      }}
    >
      <div style={{ maxWidth: 380, margin: '0 auto', width: '100%', padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: 'white', fontFamily: 'Sora, sans-serif' }}>
            Mobile<span style={{ color: '#4ade80' }}>Pay</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 4, fontWeight: 600, letterSpacing: 0.4 }}>
            BUSINESS — ENCAISSEMENT
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ background: 'white', borderRadius: 20, padding: 26, boxShadow: '0 20px 50px -12px rgba(0,0,0,0.4)' }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-muted)', display: 'block', marginBottom: 14 }}>
            Téléphone
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+225 07 00 00 00 00"
              autoFocus
            />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-muted)', display: 'block', marginBottom: 16 }}>
            Mot de passe
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          {error && <div style={{ color: 'var(--mp-red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button
            className="mp-btn-primary"
            style={{ width: '100%', background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }}
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
