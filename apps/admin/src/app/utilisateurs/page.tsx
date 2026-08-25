'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface UserRow {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  kycLevel: string;
  isBlocked: boolean;
  wallet: { cachedBalance: number } | null;
}

export default function UsersPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fetching, setFetching] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page, s = search) => {
    setFetching(true);
    apiFetch<{ users: UserRow[]; total: number }>(
      `/admin/users?page=${p}${s ? `&search=${encodeURIComponent(s)}` : ''}`,
    )
      .then((res) => {
        setUsers(res.users);
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

  const toggleBlocked = async (id: string, blocked: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/admin/users/${id}/blocked`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !admin) return null;

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <AdminShell title="Particuliers">
      <div className="adm-search-bar">
        <input
          className="adm-input"
          style={{ flex: 1 }}
          placeholder="Rechercher par nom ou téléphone..."
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

      {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Téléphone</th>
              <th>KYC</th>
              <th>Solde</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={6} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td>{u.phone}</td>
                  <td>{u.kycLevel}</td>
                  <td>{u.wallet ? `${(u.wallet.cachedBalance / 100).toLocaleString('fr-FR')} FCFA` : '—'}</td>
                  <td>
                    <span className={`adm-badge ${u.isBlocked ? 'red' : 'green'}`}>
                      {u.isBlocked ? 'Bloqué' : 'Actif'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`adm-btn ${u.isBlocked ? '' : 'danger'}`}
                      disabled={busyId === u.id}
                      onClick={() => toggleBlocked(u.id, !u.isBlocked)}
                    >
                      {u.isBlocked ? 'Débloquer' : 'Bloquer'}
                    </button>
                  </td>
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
