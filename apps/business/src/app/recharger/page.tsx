'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import BusinessSideMenu from '../../components/BusinessSideMenu';

interface Operator {
  operatorId: string;
  name: string;
  supportsData: boolean;
}

type Kind = 'AIRTIME' | 'DATA';

function formatFcfa(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('fr-FR');
}

export default function VenteCreditPage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const [kind, setKind] = useState<Kind>('AIRTIME');
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    apiFetch<Operator[]>(`/airtime/operators?country=${activeMerchant?.country ?? 'CI'}`).then(setOperators);
  }, [user, loading, router, activeMerchant?.country]);

  if (loading || !user || !activeMerchant) return null;

  const presets = kind === 'DATA' ? [1000, 2500, 5000, 10000] : [500, 1000, 2000, 5000];

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ status: string }>(`/merchants/${activeMerchant.merchantId}/airtime`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          phoneNumber: phone,
          amount: Math.round(Number(amount) * 100),
          kind,
          operatorId: operator?.operatorId,
          operatorName: operator?.name,
        }),
      });
      if (res.status === 'SUCCESS') {
        setResult({ status: 'success', message: `Vente réussie ! Crédit envoyé à ${phone}. 🎉` });
      } else if (res.status === 'PROCESSING' || res.status === 'PENDING') {
        setResult({ status: 'pending', message: 'Vente en cours de confirmation.' });
      } else {
        setResult({ status: 'failed', message: 'La vente a échoué.' });
      }
      setPhone('');
      setAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la vente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <div style={{ display: 'flex', gap: 6 }}>
            <Link href="/dashboard" className="mp-icon-btn" title="Accueil">
              🏠
            </Link>
            <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
              ☰
            </button>
          </div>
          <span className="mp-brand-mark">
            <span className="dot" />
            Vente crédit/data
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button
            onClick={() => logout().then(() => router.push('/login'))}
            className="mp-icon-btn"
            title="Déconnexion"
          >
            ⏻
          </button>
        </div>
      </div>

      <BusinessSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-form">
        <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
          Vendez du crédit d'appel ou un forfait data à un client — le montant est débité de votre
          wallet marchand et envoyé instantanément sur le téléphone du client.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setKind('AIRTIME')}
            className="mp-action-btn"
            style={{
              flex: 1,
              color: kind === 'AIRTIME' ? 'white' : 'var(--mp-navy)',
              background: kind === 'AIRTIME' ? 'var(--mp-navy)' : 'var(--mp-surface)',
              border: '1px solid var(--mp-border)',
            }}
          >
            📞 Crédit d'appel
          </button>
          <button
            onClick={() => setKind('DATA')}
            className="mp-action-btn"
            style={{
              flex: 1,
              color: kind === 'DATA' ? 'white' : 'var(--mp-navy)',
              background: kind === 'DATA' ? 'var(--mp-navy)' : 'var(--mp-surface)',
              border: '1px solid var(--mp-border)',
            }}
          >
            📶 Data
          </button>
        </div>

        <label>
          Opérateur du client
          <select
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={operator?.operatorId ?? ''}
            onChange={(e) => setOperator(operators.find((o) => o.operatorId === e.target.value) ?? null)}
          >
            <option value="">Sélectionner...</option>
            {operators
              .filter((o) => kind !== 'DATA' || o.supportsData)
              .map((o) => (
                <option key={o.operatorId} value={o.operatorId}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>

        <label>
          Numéro du client
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2250700000000"
          />
        </label>

        <div>
          <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600, marginBottom: 8 }}>
            Montant (FCFA)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="mp-action-btn"
                style={{
                  color: amount === String(preset) ? 'white' : 'var(--mp-navy)',
                  background: amount === String(preset) ? 'var(--mp-navy)' : 'var(--mp-surface)',
                  border: '1px solid var(--mp-border)',
                }}
              >
                {preset.toLocaleString('fr-FR')}
              </button>
            ))}
          </div>
          <input
            className="mp-input"
            style={{ width: '100%' }}
            type="number"
            placeholder="Ou montant libre"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {error && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
        {result && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: result.status === 'success' ? 'var(--mp-green-dark)' : result.status === 'pending' ? '#b8790a' : 'var(--mp-red)',
            }}
          >
            {result.message}
          </div>
        )}

        <button
          className="mp-btn-primary"
          style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }}
          disabled={submitting || !phone || !amount || !operator}
          onClick={submit}
        >
          {submitting ? 'Envoi...' : 'Valider la vente'}
        </button>
      </div>
    </div>
  );
}
