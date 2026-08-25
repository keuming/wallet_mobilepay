'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface Merchant {
  id: string;
  businessName: string;
  category: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  wallet: { cachedBalance: number } | null;
  createdAt: string;
}

const STATUS_BADGE: Record<Merchant['status'], { label: string; className: string }> = {
  ACTIVE: { label: 'Actif', className: 'green' },
  PENDING: { label: 'En attente', className: 'amber' },
  SUSPENDED: { label: 'Suspendu', className: 'red' },
  REJECTED: { label: 'Rejeté', className: 'gray' },
};

export default function MerchantsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fetching, setFetching] = useState(true);

  const load = (p = page, s = search) => {
    setFetching(true);
    apiFetch<{ merchants: Merchant[]; total: number }>(
      `/admin/merchants?page=${p}${s ? `&search=${encodeURIComponent(s)}` : ''}`,
    )
      .then((res) => {
        setMerchants(res.merchants);
        setTotal(res.total);
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  if (loading || !admin) return null;

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <AdminShell title="Marchands">
      <div className="adm-search-bar">
        <input
          className="adm-input"
          style={{ flex: 1 }}
          placeholder="Rechercher un marchand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              load(1, search);
            }
          }}
        />
        <button
          className="adm-btn ghost"
          onClick={() => {
            setPage(1);
            load(1, search);
          }}
        >
          Rechercher
        </button>
      </div>

      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Établissement</th>
              <th>Catégorie</th>
              <th>Statut</th>
              <th>Solde wallet</th>
              <th>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={5} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : merchants.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Aucun marchand trouvé.
                </td>
              </tr>
            ) : (
              merchants.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/marchands/${m.id}`} style={{ color: '#e6ecf5', textDecoration: 'none' }}>
                      {m.businessName}
                    </Link>
                  </td>
                  <td>{m.category ?? '—'}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[m.status].className}`}>
                      {STATUS_BADGE[m.status].label}
                    </span>
                  </td>
                  <td>{m.wallet ? `${(m.wallet.cachedBalance / 100).toLocaleString('fr-FR')} FCFA` : '—'}</td>
                  <td>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="adm-pagination">
          <button
            className="adm-btn ghost"
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(p, search);
            }}
          >
            ← Précédent
          </button>
          <span style={{ color: '#8a97b3', fontSize: 13, alignSelf: 'center' }}>
            Page {page} / {totalPages}
          </span>
          <button
            className="adm-btn ghost"
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(p, search);
            }}
          >
            Suivant →
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
