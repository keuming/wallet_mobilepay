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
  const { user, loading } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<Record<string, 'shared' | 'copied' | 'failed'>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

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

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('mp_balance_hidden') : null;
    if (stored === '1') setBalanceHidden(true);
  }, []);

  const toggleBalanceHidden = () => {
    setBalanceHidden((h) => {
      const next = !h;
      if (typeof window !== 'undefined') localStorage.setItem('mp_balance_hidden', next ? '1' : '0');
      return next;
    });
  };

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

  const totalSent = entries.filter((e) => e.type === 'DEBIT').reduce((sum, e) => sum + e.amount, 0);
  const totalReceived = entries.filter((e) => e.type === 'CREDIT').reduce((sum, e) => sum + e.amount, 0);

  if (loading || fetching || !user) {
    return (
      <div className="mp-container">
        <div className="mp-section">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="fz-glow" />

      <div className="fz-header-row">
        <button onClick={() => setMenuOpen(true)} className="fz-notif-btn" title="Menu">
          ☰
        </button>
        <img src="/brand/mobilepay-logo-badge-dark.svg" alt="MobilePay" className="fz-header-logo" />
        <Link href="/profil" className="fz-profile" title="Mon profil">
          {user.profilePhotoBase64 ? (
            <img src={user.profilePhotoBase64} alt="Profil" className="fz-avatar-photo" />
          ) : (
            <span className="fz-avatar">{user.firstName.charAt(0).toUpperCase()}</span>
          )}
        </Link>
      </div>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="fz-balance-card">
        <div className="fz-balance-top">
          <div>
            <span className="fz-balance-holder">{user.firstName} {user.lastName}</span>
            <span className="fz-balance-label">
              💳 Solde disponible
              <button
                className="fz-balance-toggle"
                onClick={toggleBalanceHidden}
                title={balanceHidden ? 'Afficher le solde' : 'Cacher le solde'}
              >
                {balanceHidden ? '🙈' : '👁️'}
              </button>
            </span>
            <span className="fz-balance-amount">
              {balanceHidden ? '••••••' : wallet ? formatFcfa(wallet.cachedBalance) : '—'}
              <span className="fz-currency">FCFA</span>
            </span>
          </div>
          <Link href="/recevoir" className="fz-add-money-btn">
            + Dépôt
          </Link>
        </div>

        <div className="fz-pill-row">
          <Link href="/envoyer" className="fz-pill-btn">↗️ Transfert</Link>
          <Link href="/payer" className="fz-pill-btn">🏪 Payer</Link>
          <Link href="/recharger" className="fz-pill-btn">📶 Crédit & Data</Link>
        </div>
      </div>

      <div className="fz-mini-row">
        <div className="fz-mini-card sent">
          <span className="fz-mini-icon">💸</span>
          <div>
            <span className="fz-mini-label">Envoyé</span>
            <span className="fz-mini-amount">{formatFcfa(totalSent)} F</span>
          </div>
        </div>
        <div className="fz-mini-card received">
          <span className="fz-mini-icon">💰</span>
          <div>
            <span className="fz-mini-label">Reçu</span>
            <span className="fz-mini-amount">{formatFcfa(totalReceived)} F</span>
          </div>
        </div>
      </div>

      <div className="fz-promo-banner">
        <div className="fz-promo-top">
          <div>
            <div className="fz-promo-title">Carte virtuelle</div>
            <div className="fz-promo-sub">Payer en ligne partout dans le monde</div>
          </div>
          <Link href="/carte" className="fz-promo-btn">
            Découvrir
          </Link>
        </div>
        <div className="fz-pill-row">
          <Link href="/cartes-cadeaux" className="fz-pill-btn">🎁 Cartes cadeaux</Link>
          <Link href="/factures" className="fz-pill-btn">🧾 Factures</Link>
        </div>
      </div>

      <div className="mp-section">
        <h3>
          📋 Transactions récentes
          <Link
            href="/historique"
            style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--fz-accent)' }}
          >
            Voir tout →
          </Link>
        </h3>
        {entries.length === 0 && (
          <p style={{ color: 'var(--fz-text-secondary)', fontSize: 14 }}>Aucune transaction pour le moment.</p>
        )}
        <div className="mp-history-list" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupLedgerEntries(entries).map(({ key, main: entry, feeAmount }) => {
            const name = entry.counterparty?.name ?? entry.description;
            const isExpanded = expandedId === entry.id;
            return (
              <div key={key}>
                <div
                  className="fz-tx-card"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <div className="fz-tx-left">
                    <div className={`fz-tx-icon ${entry.type === 'DEBIT' ? 'debit' : ''}`}>
                      {entry.counterparty
                        ? entry.counterparty.name.charAt(0).toUpperCase()
                        : entry.type === 'CREDIT'
                          ? '↙'
                          : '↗'}
                    </div>
                    <div>
                      <div className="fz-tx-name">{name}</div>
                      <div className="fz-tx-sub">
                        {TYPE_LABELS[entry.transaction?.type] ?? entry.transaction?.type}
                        {entry.counterparty?.phone ? ` · ${entry.counterparty.phone}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`fz-tx-amount ${entry.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                      {entry.type === 'CREDIT' ? '+' : '−'} {formatFcfa(entry.amount)} FCFA
                    </div>
                    {feeAmount !== null && (
                      <div className="mp-history-fee-line">+ {formatFcfa(feeAmount)} FCFA frais</div>
                    )}
                    <div style={{ fontSize: 10.5, color: 'var(--fz-text-secondary)', marginTop: 2 }}>
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
