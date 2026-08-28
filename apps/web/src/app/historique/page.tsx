'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import { shareReceipt } from '../../lib/receipt';
import { groupLedgerEntries } from '../../lib/groupLedgerEntries';

interface Counterparty {
  type: 'PARTICULIER' | 'MERCHANT';
  name: string;
  phone: string | null;
}

interface Transaction {
  id: string;
  reference: string;
  type: string;
  status: string;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
  transaction: Transaction;
  counterparty: Counterparty | null;
}

const PAGE_SIZE = 15;

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

const TYPE_LABELS: Record<string, string> = {
  TRANSFER: 'Transfert',
  PAYMENT: 'Paiement',
  TOPUP: 'Recharge',
  WITHDRAWAL: 'Retrait',
  AIRTIME: 'Airtime/Data',
  CARD_LOAD: 'Chargement carte',
  FEE: 'Frais',
};

export default function HistoriquePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [shareStatus, setShareStatus] = useState<Record<string, 'shared' | 'copied' | 'failed'>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    setFetching(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    apiFetch<{ entries: LedgerEntry[]; total: number }>(`/wallet/transactions?${params}`)
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
      })
      .finally(() => setFetching(false));
  }, [user, loading, router, page, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleShare = async (entry: LedgerEntry) => {
    const result = await shareReceipt({
      reference: entry.transaction.reference,
      typeLabel: TYPE_LABELS[entry.transaction.type] ?? entry.transaction.type,
      amount: entry.amount,
      direction: entry.type,
      counterpartyName: entry.counterparty?.name ?? null,
      counterpartyPhone: entry.counterparty?.phone ?? null,
      description: entry.description,
      status: entry.transaction.status,
      date: entry.createdAt,
    });
    setShareStatus((s) => ({ ...s, [entry.id]: result }));
  };

  if (loading || !user) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>📋 Historique des transactions</h1>
      </div>

      <div className="mp-search-wrap">
        <div className="mp-search-bar">
          <span className="icon">🔍</span>
          <input
            placeholder="Rechercher un nom ou un numéro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="mp-search-clear" onClick={() => setSearch('')}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="mp-history-list">
        {fetching ? (
          <div className="mp-empty-state">Chargement...</div>
        ) : entries.length === 0 ? (
          <div className="mp-empty-state">
            <span className="icon">🗂️</span>
            {debouncedSearch
              ? `Aucun résultat pour « ${debouncedSearch} ».`
              : 'Aucune transaction pour le moment.'}
          </div>
        ) : (
          groupLedgerEntries(entries).map(({ key, main: entry, feeAmount }) => {
            const isExpanded = expandedId === entry.id;
            const counterpartyName = entry.counterparty?.name ?? entry.description;
            return (
              <div
                key={key}
                className={`mp-history-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                <div className="mp-history-row">
                  <div className={`mp-history-avatar ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                    {entry.counterparty
                      ? entry.counterparty.name.charAt(0).toUpperCase()
                      : entry.type === 'CREDIT'
                        ? '↙'
                        : '↗'}
                  </div>
                  <div className="mp-history-main">
                    <div className="mp-history-name">{counterpartyName}</div>
                    <div className="mp-history-sub">
                      {TYPE_LABELS[entry.transaction.type] ?? entry.transaction.type}
                      {entry.counterparty?.phone ? ` · ${entry.counterparty.phone}` : ''}
                    </div>
                  </div>
                  <div className="mp-history-amount-block">
                    <div className={`mp-history-amount ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                      {entry.type === 'CREDIT' ? '+' : '−'} {fcfa(entry.amount)}
                    </div>
                    {feeAmount !== null && (
                      <div className="mp-history-fee-line">+ {fcfa(feeAmount)} frais</div>
                    )}
                    <div className="mp-history-time">
                      {new Date(entry.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mp-history-detail">
                    <div className="mp-detail-row">
                      <span className="k">Référence</span>
                      <span className="v">{entry.transaction.reference}</span>
                    </div>
                    <div className="mp-detail-row">
                      <span className="k">Date &amp; heure</span>
                      <span className="v">{new Date(entry.createdAt).toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="mp-detail-row">
                      <span className="k">Motif</span>
                      <span className="v">{entry.description}</span>
                    </div>
                    {feeAmount !== null && (
                      <div className="mp-detail-row">
                        <span className="k">Frais MobilePay</span>
                        <span className="v">{fcfa(feeAmount)}</span>
                      </div>
                    )}
                    {entry.counterparty && (
                      <div className="mp-detail-row">
                        <span className="k">Correspondant</span>
                        <span className="v">
                          {entry.counterparty.name}
                          {entry.counterparty.phone ? ` (${entry.counterparty.phone})` : ''}
                        </span>
                      </div>
                    )}
                    <div className="mp-detail-row">
                      <span className="k">Statut</span>
                      <span className="v">
                        <span className="mp-detail-badge">{entry.transaction.status}</span>
                      </span>
                    </div>

                    <button
                      className="mp-share-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(entry);
                      }}
                    >
                      📤 Partager le reçu
                    </button>
                    {shareStatus[entry.id] === 'copied' && (
                      <div className="mp-share-toast">Reçu copié dans le presse-papiers ✓</div>
                    )}
                    {shareStatus[entry.id] === 'shared' && (
                      <div className="mp-share-toast">Reçu partagé ✓</div>
                    )}
                    {shareStatus[entry.id] === 'failed' && (
                      <div className="mp-share-toast" style={{ color: 'var(--mp-red)' }}>
                        Impossible de partager sur cet appareil.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!fetching && entries.length > 0 && (
        <div className="mp-pagination">
          <button className="mp-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Préc.
          </button>
          <span className="mp-page-info">
            Page {page} / {totalPages}
          </span>
          <button
            className="mp-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suiv. →
          </button>
        </div>
      )}
    </div>
  );
}
