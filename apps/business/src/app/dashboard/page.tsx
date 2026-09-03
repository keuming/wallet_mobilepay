'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import BusinessSideMenu from '../../components/BusinessSideMenu';

interface DashboardData {
  availableBalance: number;
  todayCollections: number;
}

interface CashBalance {
  totalCash: number;
}

function formatFcfa(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('fr-FR');
}

export default function BusinessHomePage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [cash, setCash] = useState<CashBalance | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) return;
    apiFetch<DashboardData>(`/merchants/${activeMerchant.merchantId}/dashboard`).then(setData);
    apiFetch<CashBalance>(`/merchants/${activeMerchant.merchantId}/cash-balance`).then(setCash);
  }, [user, loading, activeMerchant, router]);

  if (loading || !user) return null;

  if (!activeMerchant) {
    return (
      <div className="mp-container">
        <div className="mp-section">
          <p style={{ color: 'var(--fz-text-secondary)' }}>
            Aucun marchand rattaché à ce compte. Contactez un agent MobilePay.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="fz-glow" />

      <div className="fz-header-row">
        <div className="fz-profile" onClick={() => setMenuOpen(true)}>
          <span className="fz-avatar">{activeMerchant.businessName.charAt(0).toUpperCase()}</span>
          <span className="fz-greeting">
            <span className="hello">Business</span>
            <span className="name">{activeMerchant.businessName}</span>
          </span>
        </div>
        <button onClick={() => logout().then(() => router.push('/login'))} className="fz-notif-btn" title="Déconnexion">
          ⏻
        </button>
      </div>

      <BusinessSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="fz-balance-card">
        <div className="fz-balance-top">
          <div>
            <span className="fz-balance-label">💰 Encaissements aujourd'hui</span>
            <span className="fz-balance-amount">
              {data ? formatFcfa(data.todayCollections) : '—'}
              <span className="fz-currency">FCFA</span>
            </span>
          </div>
          <Link href="/encaisser" className="fz-add-money-btn">
            Encaisser
          </Link>
        </div>

        <div className="fz-pill-row">
          <Link href="/recharger" className="fz-pill-btn">📞 Crédit/Data</Link>
          <Link href="/cartes-cadeaux" className="fz-pill-btn">🎁 Cartes cadeaux</Link>
          <Link href="/factures" className="fz-pill-btn">🧾 Factures</Link>
          <Link href="/transactions" className="fz-pill-btn">📋 Historique</Link>
        </div>
      </div>

      <div className="fz-mini-row">
        <div className="fz-mini-card sent">
          <span className="fz-mini-icon">💳</span>
          <div>
            <span className="fz-mini-label">Solde wallet</span>
            <span className="fz-mini-amount">{data ? formatFcfa(data.availableBalance) : '—'} F</span>
          </div>
        </div>
        <div className="fz-mini-card received">
          <span className="fz-mini-icon">💵</span>
          <div>
            <span className="fz-mini-label">Espèce en caisse</span>
            <span className="fz-mini-amount">{cash ? formatFcfa(cash.totalCash) : '0'} F</span>
          </div>
        </div>
      </div>

      <div className="mp-feature-list" style={{ marginTop: 8 }}>
        <Link href="/encaisser" className="mp-feature-card featured">
          <div className="mp-feature-icon">💰</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Encaisser un client</div>
            <div className="mp-feature-sub">QR permanent, QR dynamique, lien ou demande</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
        <Link href="/qr" className="mp-feature-card">
          <div className="mp-feature-icon">📱</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Mes QR & Liens</div>
            <div className="mp-feature-sub">Consulter mes codes actifs</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
      </div>

      <div className="mp-section">
        <p style={{ color: 'var(--fz-text-secondary)', fontSize: 12.5, textAlign: 'center' }}>
          Pour le solde, l'historique complet, les transferts et la carte virtuelle, rendez-vous sur{' '}
          <a href="https://marchand.mobilepay-ci.com" style={{ color: 'var(--fz-accent)', fontWeight: 600 }}>
            le Dashboard de gestion
          </a>
          .
        </p>
      </div>
    </div>
  );
}
