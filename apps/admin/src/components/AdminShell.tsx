'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: '📊 Dashboard' },
  { href: '/marchands', label: '🏪 Marchands' },
  { href: '/utilisateurs', label: '👤 Particuliers' },
  { href: '/agents', label: '🧑\u200d💼 Agents' },
  { href: '/transactions', label: '💳 Transactions' },
];

export default function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

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
          <button
            className="adm-logout-btn"
            onClick={() => logout().then(() => router.push('/login'))}
          >
            Déconnexion
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
