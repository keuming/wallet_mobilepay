'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantSideMenu from '../../components/MerchantSideMenu';

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
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
            ☰
          </button>
          <span className="mp-brand-mark">
            <span className="dot" />
            Transactions
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">
            ⏻
          </button>
        </div>
      </div>

      <MerchantSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-section">
        {fetching ? (
          <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Chargement...</p>
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Aucune transaction pour le moment.</p>
        ) : (
          <div className="mp-history-list" style={{ padding: 0 }}>
            {entries.map((entry) => (
              <div className="mp-history-card" key={entry.id} style={{ cursor: 'default' }}>
                <div className="mp-history-row">
                  <div className={`mp-history-avatar ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                    {entry.type === 'CREDIT' ? '↙' : '↗'}
                  </div>
                  <div className="mp-history-main">
                    <div className="mp-history-name">{entry.description}</div>
                  </div>
                  <div className="mp-history-amount-block">
                    <div className={`mp-history-amount ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                      {entry.type === 'CREDIT' ? '+' : '−'} {fcfa(entry.amount)} FCFA
                    </div>
                    <div className="mp-history-time">{new Date(entry.createdAt).toLocaleDateString('fr-FR')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button
            className="mp-icon-btn"
            style={{ width: 'auto', padding: '0 12px' }}
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(p);
            }}
          >
            ← Préc.
          </button>
          <span style={{ color: 'var(--mp-muted)', fontSize: 13 }}>
            Page {page} / {totalPages}
          </span>
          <button
            className="mp-icon-btn"
            style={{ width: 'auto', padding: '0 12px' }}
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
    </div>
  );
}
