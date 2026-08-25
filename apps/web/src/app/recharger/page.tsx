'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';

export default function RechargerPage() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Déclenche un cash-in HUB2 (Orange Money / MTN MoMo / Moov / Wave selon
      // le numéro) : un prompt USSD arrive sur le téléphone de l'utilisateur.
      // Le wallet n'est crédité qu'à la réception du webhook HUB2 confirmé.
      await apiFetch('/wallets/topup', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Math.round(Number(amount) * 100), providerName: 'HUB2' }),
      });
      setPending(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La recharge a échoué.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pending) {
    return (
      <div className="mp-container">
        <div className="mp-header">
          <Link href="/dashboard" className="mp-link" style={{ color: 'white' }}>
            ← Retour
          </Link>
        </div>
        <div className="mp-section">
          <p>Une demande de confirmation a été envoyée sur votre téléphone (Orange Money / MTN MoMo / Moov / Wave).</p>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Votre solde sera mis à jour automatiquement dès la confirmation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-header">
        <Link href="/dashboard" className="mp-link" style={{ color: 'white' }}>
          ← Retour
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: 20 }}>Recharger mon wallet</h1>
      </div>
      <form className="mp-form" onSubmit={handleSubmit}>
        <label>
          Montant (FCFA)
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 4 }}
            type="number"
            min={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        {error && <div className="mp-error">{error}</div>}
        <button className="mp-btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Envoi...' : 'Recharger'}
        </button>
      </form>
    </div>
  );
}
