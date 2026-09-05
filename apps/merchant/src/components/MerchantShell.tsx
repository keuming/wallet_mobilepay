'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: '🏠 Accueil' },
  { href: '/wallet', label: '💼 Wallet' },
  { href: '/transactions', label: '📋 Transactions' },
  { href: '/carte', label: '💳 Carte virtuelle' },
  { href: '/qr', label: '📱 QR Code' },
  { href: '/detaillants', label: '🏬 Mes détaillants' },
];

export default function MerchantShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, activeMerchant, merchants, setActiveMerchantId } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Ferme le tiroir mobile automatiquement dès qu'on change de page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="mc-shell">
      <div className={`mc-sidebar-overlay ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />

      <aside className={`mc-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="mc-sidebar-brand">
          <span style={{ color: 'white' }}>
            Mobile<span style={{ color: '#00d27a' }}>Pay</span>
          </span>
          <button className="mc-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
            ✕
          </button>
        </div>

        {/* Sélecteur multi-boutiques (§ un compte peut gérer plusieurs marchands) */}
        {merchants.length > 1 ? (
          <select
            className="mc-merchant-select"
            value={activeMerchant?.merchantId ?? ''}
            onChange={(e) => {
              setActiveMerchantId(e.target.value);
              router.push('/dashboard');
            }}
          >
            {merchants.map((m) => (
              <option key={m.merchantId} value={m.merchantId}>
                {m.businessName}
              </option>
            ))}
          </select>
        ) : (
          <div className="mc-merchant-name">{activeMerchant?.businessName ?? '—'}</div>
        )}

        <nav>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`mc-nav-link ${pathname?.startsWith(item.href) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="mc-main">
        <div className="mc-topbar">
          <button className="mc-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            ☰
          </button>
          <h1>{title}</h1>
          <button className="mc-logout-btn" onClick={() => logout().then(() => router.push('/login'))}>
            Déconnexion
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
