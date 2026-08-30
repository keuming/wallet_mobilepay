'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantSideMenu from '../../components/MerchantSideMenu';

interface QrRow {
  code: string;
  type: 'MERCHANT_STATIC' | 'MERCHANT_DYNAMIC';
  status: string;
  fixedAmount: number | null;
  expiresAt: string | null;
  createdAt: string;
}

interface LinkRow {
  slug: string;
  url: string;
  amount: number | null;
  status: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Actif',
  BLOCKED: 'Bloqué',
  EXPIRED: 'Expiré',
  UNASSIGNED: 'Non assigné',
  ASSIGNED: 'Assigné',
};

export default function QrPage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [codes, setCodes] = useState<QrRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) return;
    apiFetch<QrRow[]>(`/merchants/${activeMerchant.merchantId}/qr`).then(setCodes);
    apiFetch<LinkRow[]>(`/merchants/${activeMerchant.merchantId}/payment-links`).then(setLinks);
  }, [user, loading, activeMerchant, router]);

  if (loading || !user || !activeMerchant) return null;

  return (
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
            ☰
          </button>
          <span className="mp-brand-mark">
            <span className="dot" />
            QR & Liens
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">
            ⏻
          </button>
        </div>
      </div>

      <MerchantSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-section">
        <h3>📱 QR Codes</h3>
        {codes.length === 0 && <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Aucun QR généré.</p>}
        <div className="mp-history-list" style={{ padding: 0 }}>
          {codes.map((qr) => (
            <div className="mp-history-card" key={qr.code} style={{ cursor: 'default' }}>
              <div className="mp-history-row">
                <div className="mp-history-avatar credit">📱</div>
                <div className="mp-history-main">
                  <div className="mp-history-name" style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{qr.code}</div>
                  <div className="mp-history-sub">
                    {qr.type === 'MERCHANT_STATIC' ? 'Permanent' : 'Dynamique'} · {STATUS_LABEL[qr.status] ?? qr.status}
                  </div>
                </div>
                <div className="mp-history-amount-block">
                  <div className="mp-history-amount credit">{qr.fixedAmount ? `${(qr.fixedAmount / 100).toLocaleString('fr-FR')} FCFA` : '—'}</div>
                  <div className="mp-history-time">{new Date(qr.createdAt).toLocaleDateString('fr-FR')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mp-section">
        <h3>🔗 Payment Links</h3>
        {links.length === 0 && <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Aucun lien créé.</p>}
        <div className="mp-history-list" style={{ padding: 0 }}>
          {links.map((link) => (
            <div className="mp-history-card" key={link.slug} style={{ cursor: 'default' }}>
              <div className="mp-history-row">
                <div className="mp-history-avatar credit">🔗</div>
                <div className="mp-history-main">
                  <div className="mp-history-name" style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{link.url}</div>
                  <div className="mp-history-sub">{STATUS_LABEL[link.status] ?? link.status}</div>
                </div>
                <div className="mp-history-amount-block">
                  <div className="mp-history-amount credit">{link.amount ? `${(link.amount / 100).toLocaleString('fr-FR')} FCFA` : 'Libre'}</div>
                  <div className="mp-history-time">{new Date(link.createdAt).toLocaleDateString('fr-FR')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
