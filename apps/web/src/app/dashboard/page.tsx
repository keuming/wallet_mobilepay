'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import { shareReceipt } from '../../lib/receipt';
import { groupLedgerEntries } from '../../lib/groupLedgerEntries';
import SideMenu from '../../components/SideMenu';

interface Wallet {
  cachedBalance: number;
  currency: string;
}

interface Counterparty {
  type: 'PARTICULIER' | 'MERCHANT';
  name: string;
  phone: string | null;
}

interface Transaction {
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

function formatFcfa(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('fr-FR');
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

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<Record<string, 'shared' | 'copied' | 'failed'>>({});
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className="mp-header-row">
          <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
            ☰
          </button>
          <span className="mp-brand-mark">
            <span className="dot" />
            Bonjour {user.firstName}
          </span>
          <button
            onClick={() => logout().then(() => router.push('/login'))}
            className="mp-icon-btn"
            title="Déconnexion"
          >
            ⏻
          </button>
        </div>
      </div>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-balance-card">
        <div className="mp-balance-label">💳 Solde disponible</div>
        <div className="mp-balance-amount">
          {wallet ? formatFcfa(wallet.cachedBalance) : '—'}
          <span className="currency">FCFA</span>
        </div>

        <div className="mp-actions">
          <Link href="/recevoir" className="mp-action-btn">
            <span className="icon">💰</span>
            Dépôt
          </Link>
          <Link href="/envoyer" className="mp-action-btn">
            <span className="icon">↗️</span>
            Transfert
          </Link>
          <Link href="/payer" className="mp-action-btn">
            <span className="icon">🏪</span>
            Payer
          </Link>
          <Link href="/recharger" className="mp-action-btn">
            <span className="icon">📶</span>
            Crédit & Data
          </Link>
        </div>
      </div>

      <div className="mp-feature-list">
        <Link href="/carte" className="mp-feature-card featured">
          <div className="mp-feature-icon">💎</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Carte virtuelle</div>
            <div className="mp-feature-sub">Payer en ligne partout dans le monde</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
        <Link href="/cartes-cadeaux" className="mp-feature-card">
          <div className="mp-feature-icon">🎁</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Cartes cadeaux</div>
            <div className="mp-feature-sub">Amazon, Apple, Netflix et plus — dans le monde entier</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
        <Link href="/factures" className="mp-feature-card">
          <div className="mp-feature-icon">🧾</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Factures</div>
            <div className="mp-feature-sub">Électricité, eau, TV, internet</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
      </div>

      <div className="mp-section">
        <h3>
          📋 Transactions récentes
          <Link
            href="/historique"
            style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--mp-green-dark)' }}
          >
            Voir tout →
          </Link>
        </h3>
        {entries.length === 0 && (
          <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Aucune transaction pour le moment.</p>
        )}
        <div className="mp-history-list" style={{ padding: 0 }}>
          {groupLedgerEntries(entries).map(({ key, main: entry, feeAmount }) => {
            const name = entry.counterparty?.name ?? entry.description;
            const isExpanded = expandedId === entry.id;
            return (
              <div
                className={`mp-history-card ${isExpanded ? 'expanded' : ''}`}
                key={key}
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
                    <div className="mp-history-name">{name}</div>
                    <div className="mp-history-sub">
                      {TYPE_LABELS[entry.transaction?.type] ?? entry.transaction?.type}
                      {entry.counterparty?.phone ? ` · ${entry.counterparty.phone}` : ''}
                    </div>
                  </div>
                  <div className="mp-history-amount-block">
                    <div className={`mp-history-amount ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                      {entry.type === 'CREDIT' ? '+' : '−'} {formatFcfa(entry.amount)} FCFA
                    </div>
                    {feeAmount !== null && (
                      <div className="mp-history-fee-line">+ {formatFcfa(feeAmount)} FCFA frais</div>
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
                        <span className="v">{formatFcfa(feeAmount)} FCFA</span>
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
          })}
        </div>
      </div>
    </div>
  );
}
