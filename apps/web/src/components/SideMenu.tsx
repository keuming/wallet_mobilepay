'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const WHATSAPP_AGENT_NUMBER = '2250504921096';

interface SideMenuProps {
  open: boolean;
  onClose: () => void;
}

export default function SideMenu({ open, onClose }: SideMenuProps) {
  const { user, logout } = useAuth();
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
          <Link href="/cgu" className="mp-menu-item" onClick={onClose}>
            <span className="icon">📄</span>
            Conditions générales
          </Link>

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
