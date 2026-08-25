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
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
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
        <table className="mc-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Montant</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={3} style={{ color: '#5a7a94', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: '#5a7a94', textAlign: 'center', padding: 24 }}>
                  Aucune transaction pour le moment.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.description}</td>
                  <td style={{ fontWeight: 600, color: entry.type === 'CREDIT' ? '#0a8f58' : '#c0442c' }}>
                    {entry.type === 'CREDIT' ? '+' : '−'} {fcfa(entry.amount)}
                  </td>
                  <td style={{ color: '#5a7a94' }}>{new Date(entry.createdAt).toLocaleString('fr-FR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12 }}>
          <button
            className="mc-btn ghost"
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(p);
            }}
          >
            ← Précédent
          </button>
          <span style={{ color: '#5a7a94', fontSize: 13, alignSelf: 'center' }}>
            Page {page} / {totalPages}
          </span>
          <button
            className="mc-btn ghost"
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(p);
            }}
          >
            Suivant →
          </button>
        </div>
      </div>
    </MerchantShell>
  );
}
