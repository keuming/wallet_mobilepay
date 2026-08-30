'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface FundingRow {
  id: string;
  amount: number;
  reference: string | null;
  details: { paypalEmail?: string; currency?: string } | null;
  status: 'PENDING' | 'RECEIVED' | 'REJECTED';
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = { PENDING: 'amber', RECEIVED: 'green', REJECTED: 'red' };

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function PayPalPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [fundings, setFundings] = useState<FundingRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('XOF');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    apiFetch<number>('/admin/fundings/PAYPAL/total').then(setTotal);
    apiFetch<FundingRow[]>('/admin/fundings/PAYPAL').then(setFundings);
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  const closeModal = () => {
    setModalOpen(false);
    setAmount('');
    setCurrency('XOF');
    setPaypalEmail('');
    setReference('');
    setFormError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch('/admin/card-fundings', {
        method: 'POST',
        body: JSON.stringify({
          source: 'PAYPAL',
          amount: Math.round(Number(amount) * 100),
          reference: reference || undefined,
          details: { paypalEmail, currency },
        }),
      });
      closeModal();
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Échec de la demande.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = async (id: string) => {
    await apiFetch(`/admin/card-fundings/${id}/confirm`, { method: 'POST' });
    load();
  };

  if (loading || !admin) return null;

  return (
    <AdminShell title="PayPal">
      <div className="adm-card-brand-card visa" style={{ maxWidth: 340, marginBottom: 24 }}>
        <div className="adm-card-brand-header">
          <span className="adm-card-brand-logo">PayPal</span>
        </div>
        <div className="adm-card-brand-balance">{fcfa(total)}</div>
        <div className="adm-card-brand-label">Total reçu confirmé</div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="adm-btn" onClick={() => setModalOpen(true)}>
          🅿️ Enregistrer un rechargement PayPal
        </button>
      </div>

      <div className="adm-section-title">📋 Historique</div>
      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Compte PayPal</th>
              <th>Montant</th>
              <th>Devise</th>
              <th>Référence</th>
              <th>Statut</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fundings.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Aucun rechargement PayPal pour le moment.
                </td>
              </tr>
            ) : (
              fundings.map((f) => (
                <tr key={f.id}>
                  <td>{f.details?.paypalEmail ?? '—'}</td>
                  <td>{fcfa(f.amount)}</td>
                  <td>{f.details?.currency ?? 'XOF'}</td>
                  <td style={{ color: 'var(--adm-muted)' }}>{f.reference ?? '—'}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_CLASS[f.status]}`}>{f.status}</span>
                  </td>
                  <td style={{ color: 'var(--adm-muted)', fontSize: 12 }}>
                    {new Date(f.createdAt).toLocaleString('fr-FR')}
                  </td>
                  <td>
                    {f.status === 'PENDING' && (
                      <button className="adm-btn" onClick={() => confirm(f.id)}>
                        Confirmer reçu
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="adm-modal-overlay" onClick={closeModal}>
          <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-title">🅿️ Rechargement via PayPal</div>
            <div className="adm-modal-form">
              <label className="adm-modal-label">
                Compte PayPal source
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="compte@entreprise.com" />
              </label>
              <label className="adm-modal-label">
                Montant
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Devise
                <select className="adm-input" style={{ width: '100%', marginTop: 4 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="XOF">XOF</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
              <label className="adm-modal-label">
                Référence / note (optionnel)
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              {formError && <div className="adm-error">{formError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="adm-btn ghost" style={{ flex: 1 }} onClick={closeModal}>
                  Annuler
                </button>
                <button className="adm-btn" style={{ flex: 1 }} disabled={!amount || !paypalEmail || submitting} onClick={submit}>
                  {submitting ? 'Envoi...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
