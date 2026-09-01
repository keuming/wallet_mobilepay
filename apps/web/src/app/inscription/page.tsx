'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';

/**
 * Carte de création de compte (§ premier écran après installation de
 * l'app) — un seul code PIN sert de connexion ET de confirmation de
 * transaction, comme Orange Money/MTN MoMo.
 */
export default function InscriptionPage() {
  const { registerWithPin } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmPin.length > 0 && pin !== confirmPin;
  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    phone.trim().length > 0 &&
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

      <form className="mp-form" onSubmit={handleSubmit}>
        <label>
          Nom
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Kouassi"
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
          Numéro de téléphone
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2250700000000"
          />
        </label>
        <label>
          Code PIN <span style={{ color: 'var(--mp-muted)', fontWeight: 400 }}>(4 à 6 chiffres — connexion et transactions)</span>
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
          />
        </label>
        <label>
          Confirme ton code PIN
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            type="password"
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
        <p style={{ fontSize: 12.5, color: 'var(--mp-muted)', textAlign: 'center' }}>
          Déjà un compte ? <Link href="/login" style={{ color: 'var(--mp-green-dark)', fontWeight: 600 }}>Se connecter</Link>
        </p>
      </form>
    </div>
  );
}
