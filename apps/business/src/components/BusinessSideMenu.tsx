'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

interface BusinessSideMenuProps {
  open: boolean;
  onClose: () => void;
}

export default function BusinessSideMenu({ open, onClose }: BusinessSideMenuProps) {
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
          <Link href="/encaisser" className="mp-menu-item" onClick={onClose}>
            <span className="icon">💰</span>
            Encaissement
          </Link>
          <Link href="/qr" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📱</span>
            QR Codes
          </Link>
          <Link href="/recharger" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📞</span>
            Vente crédit/data
          </Link>

          <div className="mp-menu-divider" />

          <a
            href="https://marchand.mobilepay-ci.com"
            className="mp-menu-item"
            onClick={onClose}
          >
            <span className="icon">📊</span>
            Dashboard de gestion
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
        </div>
      </div>
    </>
  );
}
