'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: '📊 Dashboard' },
  { href: '/marchands', label: '🏪 Marchands' },
  { href: '/utilisateurs', label: '👤 Particuliers' },
  { href: '/agents', label: '🧑\u200d💼 Agents' },
  { href: '/transactions', label: '💳 Transactions' },
  { href: '/cartes', label: '💎 Cartes virtuelles' },
  { href: '/providers', label: '🔌 Providers' },
];

type Theme = 'dark' | 'light';

export default function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('mp-admin-theme') as Theme) || 'dark';
    setTheme(stored);
    document.documentElement.setAttribute('data-theme', stored);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mp-admin-theme', next);
  };

  return (
    <div className="adm-shell">
      <aside className="adm-sidebar">
        <div className="adm-sidebar-brand">
          Mobile<span>Pay</span> Admin
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`adm-nav-link ${pathname?.startsWith(item.href) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="adm-main">
        <div className="adm-topbar">
          <h1>{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="adm-theme-toggle" onClick={toggleTheme} title="Changer de thème">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className="adm-logout-btn"
              onClick={() => logout().then(() => router.push('/login'))}
            >
              Déconnexion
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
