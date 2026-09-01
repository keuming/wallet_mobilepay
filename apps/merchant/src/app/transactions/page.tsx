'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

export default function TransactionsPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(true);

  const load = (p = page) => {
    if (!activeMerchant) return;
    setFetching(true);
    apiFetch<{ entries: LedgerEntry[]; total: number }>(
      `/merchants/${activeMerchant.merchantId}/transactions?page=${p}`,
    )
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, activeMerchant, router]);

  if (loading || !user || !activeMerchant) return null;

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <MerchantShell title="Transactions">
      <div className="mc-panel">
        {fetching ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)' }}>Chargement...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)' }}>Aucune transaction pour le moment.</div>
        ) : (
          <table className="mc-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th>Montant</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.description}</td>
                  <td>
                    <span className={`mc-badge ${entry.type === 'CREDIT' ? 'green' : 'red'}`}>
                      {entry.type === 'CREDIT' ? 'Crédit' : 'Débit'}
                    </span>
                  </td>
                  <td>
                    {entry.type === 'CREDIT' ? '+' : '−'} {fcfa(entry.amount)} FCFA
                  </td>
                  <td>{new Date(entry.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, padding: 16 }}>
          <button
            className="mc-btn ghost"
            style={{ padding: '6px 14px' }}
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(p);
            }}
          >
            ← Préc.
          </button>
          <span style={{ color: 'var(--mc-muted)', fontSize: 13 }}>
            Page {page} / {totalPages}
          </span>
          <button
            className="mc-btn ghost"
            style={{ padding: '6px 14px' }}
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(p);
            }}
          >
            Suiv. →
          </button>
        </div>
      </div>
    </MerchantShell>
  );
}
