'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface CardRow {
  id: string;
  maskedPan: string | null;
  balance: number;
  status: 'PENDING' | 'ACTIVE' | 'FROZEN' | 'CLOSED';
  issuer: string;
  ownerUser: { firstName: string; lastName: string; phone: string } | null;
  ownerMerchant: { businessName: string } | null;
  createdAt: string;
}

interface FundingRow {
  id: string;
  brand: 'VISA' | 'MASTERCARD' | null;
  source: 'BANK_TRANSFER' | 'PAYPAL' | 'MANUAL';
  amount: number;
  reference: string | null;
  status: 'PENDING' | 'RECEIVED' | 'REJECTED';
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'green',
  FROZEN: 'red',
  PENDING: 'amber',
  CLOSED: 'gray',
  RECEIVED: 'green',
  REJECTED: 'red',
};

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function CardsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const [balances, setBalances] = useState<{ VISA: number; MASTERCARD: number }>({ VISA: 0, MASTERCARD: 0 });
  const [fundings, setFundings] = useState<FundingRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [brand, setBrand] = useState<'VISA' | 'MASTERCARD' | ''>('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    setFetching(true);
    apiFetch<CardRow[]>('/admin/cards')
      .then(setCards)
      .finally(() => setFetching(false));
  };

  const loadFundingData = () => {
    apiFetch<{ VISA: number; MASTERCARD: number }>('/admin/card-fundings/balances').then(setBalances);
    // Ce panneau ne concerne que les rechargements de carte (avec une marque
    // renseignée) — PayPal/Virement sont désormais des rails indépendants,
    // consultables sur leurs propres pages du menu.
    apiFetch<FundingRow[]>('/admin/card-fundings').then((all) => setFundings(all.filter((f) => f.brand)));
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load();
    loadFundingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  const toggleFreeze = async (card: CardRow) => {
    setBusyId(card.id);
    setError(null);
    try {
      await apiFetch(`/admin/cards/${card.id}/${card.status === 'FROZEN' ? 'unfreeze' : 'freeze'}`, {
        method: 'PATCH',
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de l\'opération.');
    } finally {
      setBusyId(null);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setBrand('');
    setAmount('');
    setReference('');
    setFormError(null);
  };

  const submitFunding = async () => {
    if (!brand || !amount) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch('/admin/card-fundings', {
        method: 'POST',
        body: JSON.stringify({
          brand,
          source: 'MANUAL',
          amount: Math.round(Number(amount) * 100),
          reference: reference || undefined,
        }),
      });
      closeModal();
      loadFundingData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Échec de la demande.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmFunding = async (id: string) => {
    try {
      await apiFetch(`/admin/card-fundings/${id}/confirm`, { method: 'POST' });
      loadFundingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la confirmation.');
    }
  };

  if (loading || !admin) return null;

  return (
    <AdminShell title="Cartes virtuelles">
      <div className="adm-provider-grid">
        <div className="adm-card-brand-card visa">
          <div className="adm-card-brand-header">
            <span className="adm-card-brand-logo">VISA</span>
          </div>
          <div className="adm-card-brand-balance">{fcfa(balances.VISA)}</div>
          <div className="adm-card-brand-label">Solde disponible</div>
        </div>
        <div className="adm-card-brand-card mastercard">
          <div className="adm-card-brand-header">
            <span className="adm-card-brand-logo">
              <span className="mc-circle mc-circle-1" />
              <span className="mc-circle mc-circle-2" />
            </span>
          </div>
          <div className="adm-card-brand-balance">{fcfa(balances.MASTERCARD)}</div>
          <div className="adm-card-brand-label">Solde disponible</div>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <button className="adm-btn" onClick={() => setModalOpen(true)}>
          💳 Recharger une carte
        </button>
      </div>

      <div className="adm-section-title">📋 Historique des rechargements</div>
      <div className="adm-panel" style={{ marginBottom: 28 }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Marque</th>
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
                <td colSpan={6} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Aucun rechargement pour le moment.
                </td>
              </tr>
            ) : (
              fundings.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 700 }}>{f.brand}</td>
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
                      <button className="adm-btn" onClick={() => confirmFunding(f.id)}>
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
            <div className="adm-modal-title">💳 Recharger une carte</div>
            <div className="adm-modal-form">
              <label className="adm-modal-label">
                Marque
                <select
                  className="adm-input"
                  style={{ width: '100%', marginTop: 4 }}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as 'VISA' | 'MASTERCARD')}
                >
                  <option value="">Sélectionner...</option>
                  <option value="VISA">VISA</option>
                  <option value="MASTERCARD">Mastercard</option>
                </select>
              </label>
              {brand && (
                <>
                  <label className="adm-modal-label">
                    Montant (FCFA)
                    <input
                      className="adm-input"
                      style={{ width: '100%', marginTop: 4 }}
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label className="adm-modal-label">
                    Référence / motif (optionnel)
                    <input
                      className="adm-input"
                      style={{ width: '100%', marginTop: 4 }}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                </>
              )}
              {formError && <div className="adm-error">{formError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="adm-btn ghost" onClick={closeModal} style={{ flex: 1 }}>
                  Annuler
                </button>
                <button
                  className="adm-btn"
                  disabled={!brand || !amount || submitting}
                  onClick={submitFunding}
                  style={{ flex: 1 }}
                >
                  {submitting ? 'Envoi...' : 'Enregistrer la demande'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--adm-muted)', marginTop: 4 }}>
                Enregistrée en attente — confirmez-la une fois l'argent effectivement reçu.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="adm-section-title">💎 Cartes émises</div>
      {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Titulaire</th>
              <th>Numéro masqué</th>
              <th>Solde</th>
              <th>Émetteur</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={6} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : cards.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Aucune carte émise.
                </td>
              </tr>
            ) : (
              cards.map((card) => (
                <tr key={card.id}>
                  <td>
                    {card.ownerUser
                      ? `${card.ownerUser.firstName} ${card.ownerUser.lastName}`
                      : card.ownerMerchant?.businessName}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{card.maskedPan ?? '—'}</td>
                  <td>{fcfa(card.balance)}</td>
                  <td>{card.issuer}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_CLASS[card.status]}`}>{card.status}</span>
                  </td>
                  <td>
                    {(card.status === 'ACTIVE' || card.status === 'FROZEN') && (
                      <button
                        className={`adm-btn ${card.status === 'ACTIVE' ? 'danger' : ''}`}
                        disabled={busyId === card.id}
                        onClick={() => toggleFreeze(card)}
                      >
                        {card.status === 'ACTIVE' ? 'Geler' : 'Dégeler'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
