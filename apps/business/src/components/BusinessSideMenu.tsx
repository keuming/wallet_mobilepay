'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ThemeId } from '../contexts/ThemeContext';

const THEME_OPTIONS: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'light', label: 'Clair', swatch: '#0f9d58' },
  { id: 'dark', label: 'Sombre', swatch: '#66fe4c' },
  { id: 'maroon', label: 'Marron', swatch: '#d97b4f' },
  { id: 'turquoise', label: 'Turquoise', swatch: '#2dd4bf' },
];

interface BusinessSideMenuProps {
  open: boolean;
  onClose: () => void;
}

export default function BusinessSideMenu({ open, onClose }: BusinessSideMenuProps) {
  const { user, activeMerchant, logout } = useAuth();
  const { theme, setTheme } = useTheme();
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
          <Link href="/transactions" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📋</span>
            Historique
          </Link>
          <Link href="/qr" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📱</span>
            QR Codes
          </Link>
          <Link href="/recharger" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📞</span>
            Vente crédit/data
          </Link>
          <Link href="/cartes-cadeaux" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🎁</span>
            Cartes cadeaux
          </Link>
          <Link href="/factures" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🧾</span>
            Factures
          </Link>
          <Link href="/confidentialite" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🔒</span>
            Politique de confidentialité
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

          <div style={{ padding: '10px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fz-text-secondary)', marginBottom: 8 }}>Apparence</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 4px', borderRadius: 10,
                    border: theme === opt.id ? '2px solid var(--fz-accent)' : '1px solid var(--fz-border)',
                    background: 'var(--fz-surface)', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: opt.swatch, display: 'block' }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fz-text-primary)' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

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
