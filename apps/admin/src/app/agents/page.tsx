'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface AgentRow {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  zone: string | null;
  commissionBps: number;
  user: { firstName: string; lastName: string; phone: string };
  _count: { merchants: number };
}

export default function AgentsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const load = () => {
    setFetching(true);
    apiFetch<{ agents: AgentRow[] }>('/admin/agents')
      .then((res) => setAgents(res.agents))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  const toggleStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED') => {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/admin/agents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !admin) return null;

  return (
    <AdminShell title="Agents terrain">
      {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Téléphone</th>
              <th>Zone</th>
              <th>Marchands créés</th>
              <th>Commission</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={7} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Aucun agent enregistré.
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr key={a.id}>
                  <td>{a.user.firstName} {a.user.lastName}</td>
                  <td>{a.user.phone}</td>
                  <td>{a.zone ?? '—'}</td>
                  <td>{a._count.merchants}</td>
                  <td>{a.commissionBps / 100}%</td>
                  <td>
                    <span className={`adm-badge ${a.status === 'ACTIVE' ? 'green' : 'red'}`}>
                      {a.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`adm-btn ${a.status === 'ACTIVE' ? 'danger' : ''}`}
                      disabled={busyId === a.id}
                      onClick={() => toggleStatus(a.id, a.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
                    >
                      {a.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
