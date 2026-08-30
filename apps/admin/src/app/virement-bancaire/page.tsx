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
  details: { bankName?: string; swiftBic?: string; iban?: string } | null;
  status: 'PENDING' | 'RECEIVED' | 'REJECTED';
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = { PENDING: 'amber', RECEIVED: 'green', REJECTED: 'red' };

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function VirementBancairePage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [fundings, setFundings] = useState<FundingRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [swiftBic, setSwiftBic] = useState('');
  const [iban, setIban] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    apiFetch<number>('/admin/fundings/BANK_TRANSFER/total').then(setTotal);
    apiFetch<FundingRow[]>('/admin/fundings/BANK_TRANSFER').then(setFundings);
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
    setBankName('');
    setSwiftBic('');
    setIban('');
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
          source: 'BANK_TRANSFER',
          amount: Math.round(Number(amount) * 100),
          reference: reference || undefined,
          details: { bankName, swiftBic, iban },
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
    <AdminShell title="Virement bancaire">
      <div className="adm-card-brand-card mastercard" style={{ maxWidth: 340, marginBottom: 24 }}>
        <div className="adm-card-brand-header">
          <span className="adm-card-brand-logo" style={{ fontStyle: 'normal' }}>🏦</span>
        </div>
        <div className="adm-card-brand-balance">{fcfa(total)}</div>
        <div className="adm-card-brand-label">Total reçu confirmé</div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="adm-btn" onClick={() => setModalOpen(true)}>
          🏦 Enregistrer un virement
        </button>
      </div>

      <div className="adm-section-title">📋 Historique</div>
      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Banque</th>
              <th>IBAN</th>
              <th>Montant</th>
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
                  Aucun virement enregistré pour le moment.
                </td>
              </tr>
            ) : (
              fundings.map((f) => (
                <tr key={f.id}>
                  <td>{f.details?.bankName ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{f.details?.iban ?? '—'}</td>
                  <td>{fcfa(f.amount)}</td>
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
            <div className="adm-modal-title">🏦 Rechargement par virement bancaire</div>
            <div className="adm-modal-form">
              <label className="adm-modal-label">
                Nom de la banque
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Ex: Société Générale CI" />
              </label>
              <label className="adm-modal-label">
                Code SWIFT / BIC
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={swiftBic} onChange={(e) => setSwiftBic(e.target.value.toUpperCase())} placeholder="Ex: SGCICIAB" />
              </label>
              <label className="adm-modal-label">
                IBAN
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="CI93 XXXX XXXX XXXX XXXX XXXX XXX" />
              </label>
              <label className="adm-modal-label">
                Montant (FCFA)
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Motif (optionnel)
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              {formError && <div className="adm-error">{formError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="adm-btn ghost" style={{ flex: 1 }} onClick={closeModal}>
                  Annuler
                </button>
                <button className="adm-btn" style={{ flex: 1 }} disabled={!amount || !bankName || !iban || submitting} onClick={submit}>
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
