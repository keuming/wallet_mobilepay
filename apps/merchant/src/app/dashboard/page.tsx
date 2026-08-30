'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantSideMenu from '../../components/MerchantSideMenu';

interface DashboardData {
  availableBalance: number;
  pendingBalance: number;
  todayCollections: number;
  monthCollections: number;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
}

function formatFcfa(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('fr-FR');
}

export default function DashboardPage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) {
      setFetching(false);
      return;
    }
    Promise.all([
      apiFetch<DashboardData>(`/merchants/${activeMerchant.merchantId}/dashboard`),
      apiFetch<{ entries: LedgerEntry[] }>(`/merchants/${activeMerchant.merchantId}/transactions?pageSize=10`),
    ])
      .then(([dash, tx]) => {
        setData(dash);
        setRecent(tx.entries);
      })
      .finally(() => setFetching(false));
  }, [user, loading, activeMerchant, router]);

  if (loading || fetching || !user) {
    return (
      <div className="mp-container">
        <div className="mp-section">Chargement...</div>
      </div>
    );
  }

  if (!activeMerchant) {
    return (
      <div className="mp-container">
        <div className="mp-section">
          <p style={{ color: 'var(--mp-muted)' }}>
            Aucun marchand rattaché à ce compte. Contactez un agent MobilePay pour créer votre établissement.
          </p>
        </div>
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
            {activeMerchant.businessName}
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

      <MerchantSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {activeMerchant.status !== 'ACTIVE' && (
        <div
          style={{
            margin: '16px 20px 0',
            background: '#fef3f0',
            border: '1px solid #f0c4b8',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 12.5,
            color: '#c0442c',
          }}
        >
          Votre établissement est en statut <strong>{activeMerchant.status}</strong> — l'encaissement est
          désactivé tant que le dossier KYC n'est pas validé.
        </div>
      )}

      <div className="mp-balance-card">
        <div className="mp-balance-label">💳 Solde disponible</div>
        <div className="mp-balance-amount">
          {data ? formatFcfa(data.availableBalance) : '—'}
          <span className="currency">FCFA</span>
        </div>

        <div className="mp-actions">
          <Link href="/encaisser" className="mp-action-btn">
            <span className="icon">💰</span>
            Encaisser
          </Link>
          <Link href="/qr" className="mp-action-btn">
            <span className="icon">📱</span>
            Mes QR
          </Link>
          <Link href="/transactions" className="mp-action-btn">
            <span className="icon">📋</span>
            Historique
          </Link>
          <Link href="/encaisser?tab=link" className="mp-action-btn">
            <span className="icon">🔗</span>
            Lien
          </Link>
        </div>
      </div>

      {data && (
        <div className="mp-feature-list" style={{ marginTop: 8 }}>
          <div className="mp-feature-card" style={{ cursor: 'default' }}>
            <div className="mp-feature-icon">⏳</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">{formatFcfa(data.pendingBalance)} FCFA</div>
              <div className="mp-feature-sub">Fonds en attente de règlement</div>
            </div>
          </div>
          <div className="mp-feature-card" style={{ cursor: 'default' }}>
            <div className="mp-feature-icon">📆</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">
                {formatFcfa(data.todayCollections)} FCFA <span style={{ color: 'var(--mp-muted)', fontWeight: 500 }}>aujourd'hui</span>
              </div>
              <div className="mp-feature-sub">{formatFcfa(data.monthCollections)} FCFA encaissés ce mois</div>
            </div>
          </div>
          <Link href="/carte" className="mp-feature-card featured">
            <div className="mp-feature-icon">💎</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">Carte virtuelle</div>
              <div className="mp-feature-sub">Payer en ligne partout dans le monde</div>
            </div>
            <div className="mp-feature-chevron">→</div>
          </Link>
        </div>
      )}

      <div className="mp-section">
        <h3>
          📋 Dernières transactions
          <Link
            href="/transactions"
            style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--mp-green-dark)' }}
          >
            Voir tout →
          </Link>
        </h3>
        {recent.length === 0 && (
          <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Aucune transaction pour le moment.</p>
        )}
        <div className="mp-history-list" style={{ padding: 0 }}>
          {recent.map((entry) => (
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
                    {entry.type === 'CREDIT' ? '+' : '−'} {formatFcfa(entry.amount)} FCFA
                  </div>
                  <div className="mp-history-time">
                    {new Date(entry.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
