'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: '🏠 Accueil' },
  { href: '/wallet', label: '💼 Wallet' },
  { href: '/encaisser', label: '💰 Encaissement' },
  { href: '/qr', label: '📱 QR Codes' },
  { href: '/transactions', label: '📋 Transactions' },
  { href: '/carte', label: '💳 Carte virtuelle' },
];

export default function MerchantShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, activeMerchant, merchants, setActiveMerchantId } = useAuth();

  return (
    <div className="mc-shell">
      <aside className="mc-sidebar">
        <div className="mc-sidebar-brand">
          Mobile<span>Pay</span>
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
