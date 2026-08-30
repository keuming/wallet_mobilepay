'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, ApiError } from '../lib/apiClient';
import AdminShell from './AdminShell';

interface ClientRow {
  id: string;
  notes: string | null;
  createdAt: string;
  merchant: {
    id: string;
    businessName: string;
    category: string | null;
    status: string;
    wallet: { cachedBalance: number } | null;
  };
}

interface MerchantSearchResult {
  id: string;
  businessName: string;
  category: string | null;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
  transaction: { reference: string; type: string; status: string };
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'green',
  PENDING: 'amber',
  SUSPENDED: 'red',
  REJECTED: 'gray',
};

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function EnterpriseServicePage({
  serviceType,
  title,
  icon,
  description,
}: {
  serviceType: 'COLLECTE' | 'BULK_PAYMENT';
  title: string;
  icon: string;
  description: string;
}) {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<MerchantSearchResult[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantSearchResult | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = () => {
    apiFetch<ClientRow[]>(`/admin/enterprise-clients/${serviceType}`).then(setClients);
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

  const runSearch = async () => {
    if (!searchTerm) return;
    const res = await apiFetch<{ merchants: MerchantSearchResult[] }>(
      `/admin/merchants?search=${encodeURIComponent(searchTerm)}`,
    );
    setSearchResults(res.merchants);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSearchTerm('');
    setSearchResults([]);
    setSelectedMerchant(null);
    setNotes('');
    setFormError(null);
  };

  const submitAdd = async () => {
    if (!selectedMerchant) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch('/admin/enterprise-clients', {
        method: 'POST',
        body: JSON.stringify({ serviceType, merchantId: selectedMerchant.id, notes: notes || undefined }),
      });
      closeModal();
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Échec de l\'ajout.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeClient = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/admin/enterprise-clients/${id}/remove`, { method: 'PATCH' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  const toggleHistory = async (client: ClientRow) => {
    if (expandedId === client.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(client.id);
    setHistoryLoading(true);
    try {
      const rows = await apiFetch<LedgerEntry[]>(`/admin/enterprise-clients/${client.id}/transactions`);
      setHistory(rows);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading || !admin) return null;

  return (
    <AdminShell title={title}>
      <p style={{ color: 'var(--adm-muted)', fontSize: 13, marginBottom: 20 }}>{description}</p>

      <div style={{ marginBottom: 20 }}>
        <button className="adm-btn" onClick={() => setModalOpen(true)}>
          + Ajouter un client
        </button>
      </div>

      {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Catégorie</th>
              <th>Solde wallet</th>
              <th>Statut</th>
              <th>Depuis le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Aucun client {icon} pour le moment.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <Fragment key={c.id}>
                  <tr
                    onClick={() => toggleHistory(c)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700 }}>{c.merchant.businessName}</td>
                    <td>{c.merchant.category ?? '—'}</td>
                    <td>{c.merchant.wallet ? fcfa(c.merchant.wallet.cachedBalance) : '—'}</td>
                    <td>
                      <span className={`adm-badge ${STATUS_CLASS[c.merchant.status] ?? 'gray'}`}>
                        {c.merchant.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--adm-muted)', fontSize: 12 }}>
                      {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td>
                      <button
                        className="adm-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeClient(c.id);
                        }}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0, background: 'var(--adm-panel-2)' }}>
                        <div style={{ padding: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--adm-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                            Historique des transactions
                          </div>
                          {historyLoading ? (
                            <p style={{ color: 'var(--adm-muted)', fontSize: 13 }}>Chargement...</p>
                          ) : history.length === 0 ? (
                            <p style={{ color: 'var(--adm-muted)', fontSize: 13 }}>Aucune transaction.</p>
                          ) : (
                            <table className="adm-table">
                              <thead>
                                <tr>
                                  <th>Référence</th>
                                  <th>Motif</th>
                                  <th>Montant</th>
                                  <th>Statut</th>
                                  <th>Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {history.map((h) => (
                                  <tr key={h.id}>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{h.transaction.reference}</td>
                                    <td>{h.description}</td>
                                    <td style={{ color: h.type === 'CREDIT' ? 'var(--adm-accent-light)' : 'var(--adm-red)' }}>
                                      {h.type === 'CREDIT' ? '+' : '−'} {fcfa(h.amount)}
                                    </td>
                                    <td>
                                      <span className="adm-badge green">{h.transaction.status}</span>
                                    </td>
                                    <td style={{ color: 'var(--adm-muted)', fontSize: 12 }}>
                                      {new Date(h.createdAt).toLocaleString('fr-FR')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="adm-modal-overlay" onClick={closeModal}>
          <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-title">+ Ajouter un client {icon}</div>
            <div className="adm-modal-form">
              {!selectedMerchant ? (
                <>
                  <label className="adm-modal-label">
                    Rechercher un marchand existant
                    <input
                      className="adm-input"
                      style={{ width: '100%', marginTop: 4 }}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                      placeholder="Nom du marchand..."
                    />
                  </label>
                  <button className="adm-btn ghost" onClick={runSearch}>
                    Rechercher
                  </button>
                  {searchResults.map((m) => (
                    <button
                      key={m.id}
                      className="adm-btn ghost"
                      style={{ textAlign: 'left', display: 'block', width: '100%' }}
                      onClick={() => setSelectedMerchant(m)}
                    >
                      {m.businessName} {m.category ? `— ${m.category}` : ''}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div
                    style={{
                      background: 'var(--adm-panel-2)',
                      padding: '10px 14px',
                      borderRadius: 10,
                      fontSize: 13,
                    }}
                  >
                    Marchand sélectionné : <strong>{selectedMerchant.businessName}</strong>
                    <button
                      className="adm-btn ghost"
                      style={{ float: 'right', padding: '2px 8px' }}
                      onClick={() => setSelectedMerchant(null)}
                    >
                      Changer
                    </button>
                  </div>
                  <label className="adm-modal-label">
                    Notes (optionnel)
                    <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </label>
                  {formError && <div className="adm-error">{formError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="adm-btn ghost" style={{ flex: 1 }} onClick={closeModal}>
                      Annuler
                    </button>
                    <button className="adm-btn" style={{ flex: 1 }} disabled={submitting} onClick={submitAdd}>
                      {submitting ? 'Ajout...' : 'Ajouter'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
