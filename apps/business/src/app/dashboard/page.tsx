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

function formatFcfa(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('fr-FR');
}

export default function BusinessHomePage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) return;
    apiFetch<DashboardData>(`/merchants/${activeMerchant.merchantId}/dashboard`).then(setData);
  }, [user, loading, activeMerchant, router]);

  if (loading || !user) return null;

  if (!activeMerchant) {
    return (
      <div className="mp-container">
        <div className="mp-section">
          <p style={{ color: 'var(--mp-muted)' }}>
            Aucun marchand rattaché à ce compte. Contactez un agent MobilePay.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
            ☰
          </button>
          <span className="mp-brand-mark">
            <span className="dot" />
            {activeMerchant.businessName}
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">
            ⏻
          </button>
        </div>
      </div>

      <BusinessSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-balance-card">
        <div className="mp-balance-label">💳 Encaissements aujourd'hui</div>
        <div className="mp-balance-amount">
          {data ? formatFcfa(data.todayCollections) : '—'}
          <span className="currency">FCFA</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, position: 'relative' }}>
          Solde wallet : {data ? formatFcfa(data.availableBalance) : '—'} FCFA
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
        <Link href="/recharger" className="mp-feature-card featured">
          <div className="mp-feature-icon">📞</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Vente crédit/data</div>
            <div className="mp-feature-sub">Recharger le téléphone d'un client</div>
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
        <p style={{ color: 'var(--mp-muted)', fontSize: 12.5, textAlign: 'center' }}>
          Pour le solde, l'historique complet, les transferts et la carte virtuelle, rendez-vous sur{' '}
          <a href="https://marchand.mobilepay-ci.com" style={{ color: 'var(--mp-green-dark)', fontWeight: 600 }}>
            le Dashboard de gestion
          </a>
          .
        </p>
      </div>
    </div>
  );
}
