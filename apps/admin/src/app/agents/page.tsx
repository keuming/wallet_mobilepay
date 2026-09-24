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
  const [showCreate, setShowCreate] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newZone, setNewZone] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const submitCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch('/admin/agents', {
        method: 'POST',
        body: JSON.stringify({ phone: newPhone, firstName: newFirstName, lastName: newLastName, password: newPassword, zone: newZone || undefined }),
      });
      setShowCreate(false);
      setNewPhone('');
      setNewFirstName('');
      setNewLastName('');
      setNewPassword('');
      setNewZone('');
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Échec de la création.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminShell title="Agents terrain">
      <div style={{ marginBottom: 16 }}>
        <button className="adm-btn" onClick={() => setShowCreate(true)}>
          + Ajouter
        </button>
      </div>
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

      {showCreate && (
        <div className="adm-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-title">+ Ajouter un agent</div>
            <div className="adm-modal-form">
              <label className="adm-modal-label">
                Téléphone
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+2250700000000" />
              </label>
              <label className="adm-modal-label">
                Prénom
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Nom
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Zone géographique (optionnel)
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder="Ex: Abidjan Nord" />
              </label>
              <label className="adm-modal-label">
                Mot de passe temporaire (min. 8 caractères)
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              {createError && <div className="adm-error">{createError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="adm-btn ghost" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>
                  Annuler
                </button>
                <button
                  className="adm-btn"
                  style={{ flex: 1 }}
                  disabled={creating || !newPhone || !newFirstName || !newLastName || newPassword.length < 8}
                  onClick={submitCreate}
                >
                  {creating ? 'Création...' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
