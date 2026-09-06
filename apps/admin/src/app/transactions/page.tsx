'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';
import TransactionDetailModal, { STATUS_CLASS } from '../../components/TransactionDetailModal';

interface TxRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  feeAmount: number;
  failureReason: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  '', 'INITIATED', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED',
];

const TYPE_OPTIONS = [
  '', 'TRANSFER', 'PAYMENT', 'TOPUP', 'WITHDRAWAL', 'AIRTIME', 'SETTLEMENT', 'REFUND', 'FEE',
];

export default function TransactionsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [reference, setReference] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [fetching, setFetching] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = (p = page, ref = reference, st = status, ty = type) => {
    setFetching(true);
    const params = new URLSearchParams({ page: String(p) });
    if (ref) params.set('reference', ref);
    if (st) params.set('status', st);
    if (ty) params.set('type', ty);
    apiFetch<{ transactions: TxRow[]; total: number }>(`/admin/transactions?${params}`)
      .then((res) => {
        setRows(res.transactions);
        setTotal(res.total);
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load(1, '', '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  if (loading || !admin) return null;

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <AdminShell title="Transactions">
      <div className="adm-search-bar">
        <input
          className="adm-input"
          style={{ flex: 1 }}
          placeholder="Référence..."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1, reference, status, type))}
        />
        <select
          className="adm-input"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
            load(1, reference, status, e.target.value);
          }}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t || 'Tous les types'}
            </option>
          ))}
        </select>
        <select
          className="adm-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
            load(1, reference, e.target.value, type);
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || 'Tous les statuts'}
            </option>
          ))}
        </select>
        <button
          className="adm-btn ghost"
          onClick={() => {
            setPage(1);
            load(1, reference, status, type);
          }}
        >
          Filtrer
        </button>
      </div>

      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Type</th>
              <th>Montant</th>
              <th>Frais</th>
              <th>Statut</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={7} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Aucune transaction trouvée.
                </td>
              </tr>
            ) : (
              rows.map((tx) => (
                <tr key={tx.id} onClick={() => setSelectedId(tx.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{tx.reference}</td>
                  <td>{tx.type}</td>
                  <td>{(tx.amount / 100).toLocaleString('fr-FR')} FCFA</td>
                  <td>{(tx.feeAmount / 100).toLocaleString('fr-FR')} FCFA</td>
                  <td>
                    <span
                      className={`adm-badge ${STATUS_CLASS[tx.status] ?? 'gray'}`}
                      title={tx.failureReason ?? undefined}
                      style={tx.failureReason ? { cursor: 'help', borderBottom: '1px dotted currentColor' } : undefined}
                    >
                      {tx.status}
                    </span>
                    {tx.failureReason && (
                      <div style={{ fontSize: 11, color: '#c0442c', marginTop: 3, maxWidth: 260 }}>
                        {tx.failureReason}
                      </div>
                    )}
                  </td>
                  <td>{new Date(tx.createdAt).toLocaleString('fr-FR')}</td>
                  <td style={{ color: 'var(--adm-accent)', fontSize: 16, textAlign: 'center' }}>›</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="adm-pagination">
          <button
            className="adm-btn ghost"
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(p, reference, status, type);
            }}
          >
            ← Précédent
          </button>
          <span style={{ color: '#8a97b3', fontSize: 13, alignSelf: 'center' }}>
            Page {page} / {totalPages}
          </span>
          <button
            className="adm-btn ghost"
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(p, reference, status, type);
            }}
          >
            Suivant →
          </button>
        </div>
      </div>
      {selectedId && <TransactionDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </AdminShell>
  );
}
