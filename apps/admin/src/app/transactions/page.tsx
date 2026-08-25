'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface TxRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  feeAmount: number;
  createdAt: string;
}

const STATUS_OPTIONS = [
  '', 'INITIATED', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED',
];

const STATUS_CLASS: Record<string, string> = {
  SUCCESS: 'green',
  FAILED: 'red',
  CANCELLED: 'red',
  EXPIRED: 'gray',
  PENDING: 'amber',
  PROCESSING: 'amber',
  INITIATED: 'amber',
  REFUNDED: 'gray',
};

export default function TransactionsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [reference, setReference] = useState('');
  const [status, setStatus] = useState('');
  const [fetching, setFetching] = useState(true);

  const load = (p = page, ref = reference, st = status) => {
    setFetching(true);
    const params = new URLSearchParams({ page: String(p) });
    if (ref) params.set('reference', ref);
    if (st) params.set('status', st);
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
    load(1, '', '');
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
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1, reference, status))}
        />
        <select
          className="adm-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
            load(1, reference, e.target.value);
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
            load(1, reference, status);
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
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={6} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Aucune transaction trouvée.
                </td>
              </tr>
            ) : (
              rows.map((tx) => (
                <tr key={tx.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{tx.reference}</td>
                  <td>{tx.type}</td>
                  <td>{(tx.amount / 100).toLocaleString('fr-FR')} FCFA</td>
                  <td>{(tx.feeAmount / 100).toLocaleString('fr-FR')} FCFA</td>
                  <td>
                    <span className={`adm-badge ${STATUS_CLASS[tx.status] ?? 'gray'}`}>{tx.status}</span>
                  </td>
                  <td>{new Date(tx.createdAt).toLocaleString('fr-FR')}</td>
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
              load(p, reference, status);
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
              load(p, reference, status);
            }}
          >
            Suivant →
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
