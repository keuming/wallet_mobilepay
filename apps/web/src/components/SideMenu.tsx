'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ThemeId } from '../contexts/ThemeContext';

const WHATSAPP_AGENT_NUMBER = '2250504921096';

const THEME_OPTIONS: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'light', label: 'Clair', swatch: '#00d27a' },
  { id: 'dark', label: 'Sombre', swatch: '#66fe4c' },
  { id: 'maroon', label: 'Marron', swatch: '#d97b4f' },
  { id: 'turquoise', label: 'Turquoise', swatch: '#2dd4bf' },
];

interface SideMenuProps {
  open: boolean;
  onClose: () => void;
}

export default function SideMenu({ open, onClose }: SideMenuProps) {
  const { user, logout } = useAuth();
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
          <div className="mp-menu-avatar">{initials || '👤'}</div>
          <div className="mp-menu-name">
            {user.firstName} {user.lastName}
          </div>
          <div className="mp-menu-phone">{user.phone}</div>
        </div>

        <div className="mp-menu-items">
          <Link href="/profil" className="mp-menu-item" onClick={onClose}>
            <span className="icon">👤</span>
            Profil
          </Link>
          <Link href="/deplafonnement" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📈</span>
            Déplafonner mon compte
          </Link>
          <a
            href={`https://wa.me/${WHATSAPP_AGENT_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-menu-item"
            onClick={onClose}
          >
            <span className="icon">💬</span>
            Parler à un agent
          </a>

          <div className="mp-menu-divider" />

          <Link href="/code-secret" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🔒</span>
            Modifier mon code secret
          </Link>
          <Link href="/categories-depenses" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🏷️</span>
            Types de charges
          </Link>
          <Link href="/types-collecte" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🗃️</span>
            Types de collecte
          </Link>
          <Link href="/types-epargne" className="mp-menu-item" onClick={onClose}>
            <span className="icon">🥇</span>
            Types d'épargne
          </Link>
          <Link href="/releve-depenses" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📊</span>
            Relevé de dépenses
          </Link>
          <Link href="/cgu" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📄</span>
            Conditions générales
          </Link>

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

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--fz-text-secondary)', margin: '20px 0 8px', opacity: 0.7 }}>
            © {new Date().getFullYear()} ORZAYAH CI
          </p>
        </div>
      </div>
    </>
  );
}
