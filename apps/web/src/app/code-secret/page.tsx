'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import PasswordInput from '../../components/PasswordInput';
import StatusModal from '../../components/StatusModal';

function PinInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label>
      {label}
      <PasswordInput
        className="mp-input"
        style={{ marginTop: 6, letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
        inputMode="numeric"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder="••••"
      />
    </label>
  );
}

export default function CodeSecretPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  const [password, setPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [forgotMode, setForgotMode] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    apiFetch<{ hasPin: boolean }>('/auth/pin/status').then((res) => setHasPin(res.hasPin));
  }, [user, loading, router]);

  if (loading || !user || hasPin === null) return null;

  const useReset = hasPin && forgotMode;
  const mismatch = newPin.length > 0 && confirmPin.length > 0 && newPin !== confirmPin;
  const canSubmit =
    newPin.length >= 4 &&
    newPin === confirmPin &&
    (hasPin && !forgotMode ? currentPin.length >= 4 : password.length > 0);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (useReset) {
        await apiFetch('/auth/pin/reset', { method: 'POST', body: JSON.stringify({ password, pin: newPin }) });
      } else if (hasPin) {
        await apiFetch('/auth/pin', { method: 'PATCH', body: JSON.stringify({ currentPin, newPin }) });
      } else {
        await apiFetch('/auth/pin', { method: 'POST', body: JSON.stringify({ password, pin: newPin }) });
      }
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de l\'opération.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>🔒 {useReset ? 'Réinitialiser mon code secret' : hasPin ? 'Modifier mon code secret' : 'Créer mon code secret'}</h1>
      </div>

      <div className="mp-section" style={{ paddingBottom: 0 }}>
        <p style={{ color: 'var(--mp-muted)', fontSize: 13.5 }}>
          Ce code à 4-6 chiffres sera demandé pour autoriser vos transactions — distinct de votre mot
          de passe de connexion. Ne le partagez avec personne, MobilePay ne vous le demandera jamais
          par téléphone.
        </p>
      </div>

      <div className="mp-form">
        {hasPin && !forgotMode ? (
          <>
            <PinInput value={currentPin} onChange={setCurrentPin} label="Code secret actuel" />
            <button
              type="button"
              onClick={() => setForgotMode(true)}
              style={{ background: 'none', border: 'none', color: 'var(--mp-green-dark)', fontSize: 12.5, fontWeight: 600, textAlign: 'left', padding: 0, cursor: 'pointer' }}
            >
              Code oublié ?
            </button>
          </>
        ) : (
          <label>
            Mot de passe de connexion
            <PasswordInput
              className="mp-input"
              style={{ marginTop: 6 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Confirmez votre identité"
            />
          </label>
        )}

        <PinInput value={newPin} onChange={setNewPin} label="Nouveau code secret (4 à 6 chiffres)" />
        <PinInput value={confirmPin} onChange={setConfirmPin} label="Confirmer le nouveau code" />
        {mismatch && <div className="mp-error">Les deux codes ne correspondent pas.</div>}

        {success && <div className="mp-success">Code secret enregistré ✓</div>}

        <button className="mp-btn-primary" disabled={submitting || !canSubmit} onClick={handleSubmit}>
          {submitting ? 'Enregistrement...' : useReset ? 'Réinitialiser le code' : hasPin ? 'Modifier le code' : 'Créer le code'}
        </button>
      </div>

      {error && <StatusModal status="failed" message={error} onClose={() => setError(null)} />}
    </div>
  );
}
