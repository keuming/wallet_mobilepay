'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

interface MerchantSideMenuProps {
  open: boolean;
  onClose: () => void;
}

export default function MerchantSideMenu({ open, onClose }: MerchantSideMenuProps) {
  const { user, activeMerchant, logout } = useAuth();
  const router = useRouter();

  if (!open || !user) return null;

  const initials = `${user.firstName?.charAt(0) ?? ''}${user.lastName?.charAt(0) ?? ''}`.toUpperCase();

  return (
    <>
      <div className="mp-menu-overlay" onClick={onClose} />
      <div className="mp-menu-panel">
        <div className="mp-menu-header">
          <button className="mp-menu-close" onClick={onClose}>
            ✕
          </button>
          <div className="mp-menu-avatar">{initials || '🏪'}</div>
          <div className="mp-menu-name">{activeMerchant?.businessName ?? '—'}</div>
          <div className="mp-menu-phone">{user.phone}</div>
        </div>

        <div className="mp-menu-items">
          <Link href="/dashboard" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🏠</span>
            Accueil
          </Link>
          <Link href="/wallet" className="mp-menu-item" onClick={onClose}>
            <span className="icon">💼</span>
            Wallet
          </Link>
          <Link href="/transactions" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📋</span>
            Transactions
          </Link>
          <Link href="/carte" className="mp-menu-item" onClick={onClose}>
            <span className="icon">💳</span>
            Carte virtuelle
          </Link>

          <div className="mp-menu-divider" />

          <a href="https://business.mobilepay-ci.com" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📲</span>
            App Business (encaissement)
          </a>

          <div className="mp-menu-divider" />

          <button
            className="mp-menu-item danger"
            onClick={() => {
              onClose();
              logout().then(() => router.push('/login'));
            }}
          >
            <span className="icon">⏻</span>
            Déconnexion
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--fz-text-secondary)', margin: '20px 0 8px', opacity: 0.7 }}>
            © {new Date().getFullYear()} ORZAYAH CI
          </p>
        </div>
      </div>
    </>
  );
}
