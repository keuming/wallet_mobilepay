'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';

// Note MVP : la lecture caméra du QR (scan) n'est pas implémentée ici — l'app
// mobile Flutter branchera un vrai scanner et appellera les mêmes endpoints
// (`GET /qr/:code` pour résoudre, `POST /qr/:code/pay` pour payer). Cette page
// web permet de saisir le code manuellement pour tester le flux de bout en bout.
export default function PayerPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [resolved, setResolved] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleResolve = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const qr = await apiFetch(`/qr/${code}`, { auth: false });
      setResolved(qr);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'QR introuvable.');
    }
  };

  const handlePay = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/qr/${code}/pay`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          amount: resolved.fixedAmount ? undefined : Math.round(Number(amount) * 100),
        }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Le paiement a échoué.');
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
        <h1 style={{ margin: '8px 0 0', fontSize: 20 }}>Payer un marchand</h1>
      </div>

      {!resolved ? (
        <form className="mp-form" onSubmit={handleResolve}>
          <label>
            Code QR ou lien de paiement
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 4 }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MPMDEMOMERCHANT01"
              required
            />
          </label>
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" type="submit">
            Continuer
          </button>
        </form>
      ) : (
        <div className="mp-form">
          <p>
            Marchand : <strong>{resolved.merchant?.businessName}</strong>
          </p>
          {resolved.fixedAmount ? (
            <p>Montant : {(resolved.fixedAmount / 100).toLocaleString('fr-FR')} FCFA</p>
          ) : (
            <label>
              Montant (FCFA)
              <input
                className="mp-input"
                style={{ width: '100%', marginTop: 4 }}
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
          )}
          {error && <div className="mp-error">{error}</div>}
          <button className="mp-btn-primary" disabled={submitting} onClick={handlePay}>
            {submitting ? 'Paiement...' : 'Confirmer le paiement'}
          </button>
        </div>
      )}
    </div>
  );
}
