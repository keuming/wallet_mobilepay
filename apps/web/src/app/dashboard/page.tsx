'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';

interface Wallet {
  cachedBalance: number;
  currency: string;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
}

function formatFcfa(amountInCents: number): string {
  return `${(amountInCents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    Promise.all([
      apiFetch<Wallet>('/wallet'),
      apiFetch<{ entries: LedgerEntry[] }>('/wallet/transactions?pageSize=10'),
    ])
      .then(([w, history]) => {
        setWallet(w);
        setEntries(history.entries);
      })
      .finally(() => setFetching(false));
  }, [user, loading, router]);

  if (loading || fetching || !user) {
    return (
      <div className="mp-container">
        <div className="mp-section">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Bonjour {user.firstName}</span>
          <button
            onClick={() => logout().then(() => router.push('/login'))}
            style={{ background: 'none', border: 'none', color: 'white', opacity: 0.8, cursor: 'pointer' }}
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="mp-balance-card">
        <div style={{ fontSize: 13, color: '#6b7280' }}>Solde disponible</div>
        <div className="mp-balance-amount">{wallet ? formatFcfa(wallet.cachedBalance) : '—'}</div>

        <div className="mp-actions">
          <Link href="/envoyer" className="mp-action-btn">
            Envoyer
          </Link>
          <Link href="/recevoir" className="mp-action-btn">
            Recevoir
          </Link>
          <Link href="/payer" className="mp-action-btn">
            Payer
          </Link>
          <Link href="/recharger" className="mp-action-btn">
            Recharger
          </Link>
        </div>
      </div>

      <div className="mp-section">
        <h3 style={{ fontSize: 15, color: '#0f2d52' }}>Transactions récentes</h3>
        {entries.length === 0 && (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Aucune transaction pour le moment.</p>
        )}
        {entries.map((entry) => (
          <div className="mp-tx-row" key={entry.id}>
            <span>{entry.description}</span>
            <span className={`mp-tx-amount ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
              {entry.type === 'CREDIT' ? '+' : '−'} {formatFcfa(entry.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
