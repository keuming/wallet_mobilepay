'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';

export default function EnvoyerPage() {
  const router = useRouter();
  const [toPhone, setToPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // `idempotent: true` ajoute automatiquement un header Idempotency-Key —
      // si le réseau coupe et que le client retry, aucun double débit ne peut
      // se produire côté API (voir apiClient.ts et IdempotencyMiddleware).
      await apiFetch('/transfers', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          toPhone,
          amount: Math.round(Number(amount) * 100),
          description: description || undefined,
        }),
      });
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Le transfert a échoué.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-header">
        <Link href="/dashboard" className="mp-link" style={{ color: 'white' }}>
          ← Retour
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: 20 }}>Envoyer de l'argent</h1>
      </div>
      <form className="mp-form" onSubmit={handleSubmit}>
        <label>
          Numéro du bénéficiaire
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 4 }}
            value={toPhone}
            onChange={(e) => setToPhone(e.target.value)}
            placeholder="+2250700000002"
            required
          />
        </label>
        <label>
          Montant (FCFA)
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 4 }}
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Motif (optionnel)
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 4 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <div className="mp-error">{error}</div>}
        {success && <div style={{ color: '#1d6f42', fontSize: 14 }}>Transfert effectué ✓</div>}
        <button className="mp-btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Envoi...' : 'Envoyer'}
        </button>
      </form>
    </div>
  );
}
