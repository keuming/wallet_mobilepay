'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface AdminUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  adminPermissions: string[];
  isBlocked: boolean;
  createdAt: string;
}

interface Catalog {
  permissions: string[];
  presets: Record<string, { label: string; permissions: string[] }>;
}

// Libellés lisibles — les codes techniques ("users:manage") ne parlent qu'aux
// développeurs ; la personne qui gère l'équipe doit comprendre ce qu'elle coche.
const PERMISSION_LABELS: Record<string, string> = {
  'dashboard:view': 'Voir le tableau de bord',
  'transactions:view': 'Consulter les transactions',
  'users:view': 'Consulter les utilisateurs',
  'users:manage': 'Créer / modifier / bloquer des utilisateurs',
  'users:credentials': 'Réinitialiser mots de passe et codes secrets',
  'merchants:view': 'Consulter les marchands',
  'merchants:manage': 'Gérer les marchands',
  'agents:manage': 'Gérer les agents',
  'funding:manage': 'Approvisionnement manuel et cartes',
  'pricing:manage': 'Modifier la grille tarifaire',
  'qr:manage': 'Gérer les QR codes',
  'providers:view': 'Consulter les providers',
  'admin:team': "Administrer l'équipe back-office",
};

export default function EquipePage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [team, setTeam] = useState<AdminUser[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([
      apiFetch<AdminUser[]>('/admin/team'),
      apiFetch<Catalog>('/admin/team/permissions-catalog'),
    ])
      .then(([t, c]) => {
        setTeam(t);
        setCatalog(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'))
      .finally(() => setFetching(false));

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading]);

  const toggle = (list: string[], setList: (v: string[]) => void, perm: string) => {
    setList(list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm]);
  };

  const applyPreset = (setList: (v: string[]) => void, key: string) => {
    if (!catalog) return;
    setList([...(catalog.presets[key]?.permissions ?? [])]);
  };

  const submitCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await apiFetch('/admin/team', {
        method: 'POST',
        body: JSON.stringify({
          phone: newPhone,
          firstName: newFirstName,
          lastName: newLastName,
          password: newPassword,
          permissions: newPermissions,
        }),
      });
      setShowCreate(false);
      setNewPhone(''); setNewFirstName(''); setNewLastName(''); setNewPassword(''); setNewPermissions([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/admin/team/${editing.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: editPermissions }),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mise à jour impossible.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (u: AdminUser) => {
    if (!confirm(`Révoquer l'accès back-office de ${u.firstName} ${u.lastName} ?`)) return;
    setError(null);
    try {
      await apiFetch(`/admin/team/${u.id}/revoke`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Révocation impossible.');
    }
  };

  if (loading || !admin) return null;

  const PermissionPicker = ({ list, setList }: { list: string[]; setList: (v: string[]) => void }) => (
    <>
      {catalog && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {Object.entries(catalog.presets).map(([key, preset]) => (
            <button key={key} type="button" className="adm-btn ghost" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => applyPreset(setList, key)}>
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
        {catalog?.permissions.map((p) => (
          <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={list.includes(p)} onChange={() => toggle(list, setList, p)} />
            {PERMISSION_LABELS[p] ?? p}
          </label>
        ))}
      </div>
    </>
  );

  return (
    <AdminShell title="Équipe back-office">
      {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <button className="adm-btn" onClick={() => setShowCreate(true)}>+ Nouveau compte back-office</button>
      </div>

      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Téléphone</th>
              <th>Permissions</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--adm-muted)' }}>Chargement...</td></tr>
            ) : team.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--adm-muted)' }}>Aucun compte back-office.</td></tr>
            ) : (
              team.map((u) => (
                <tr key={u.id}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.phone}</td>
                  <td style={{ fontSize: 12 }}>
                    {u.isSuperAdmin ? (
                      <span className="adm-badge green">Accès complet (super-admin)</span>
                    ) : u.adminPermissions.length === 0 ? (
                      <span style={{ color: 'var(--adm-muted)' }}>Aucune permission</span>
                    ) : (
                      `${u.adminPermissions.length} permission(s)`
                    )}
                  </td>
                  <td>
                    <span className={`adm-badge ${u.isBlocked ? 'red' : 'green'}`}>
                      {u.isBlocked ? 'Bloqué' : 'Actif'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!u.isSuperAdmin && (
                      <>
                        <button
                          className="adm-btn ghost"
                          style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                          onClick={() => { setEditing(u); setEditPermissions([...u.adminPermissions]); }}
                        >
                          Permissions
                        </button>
                        <button
                          className="adm-btn ghost"
                          style={{ fontSize: 12, padding: '4px 10px', color: 'var(--adm-danger, #b91c1c)' }}
                          onClick={() => revoke(u)}
                        >
                          Révoquer
                        </button>
                      </>
                    )}
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
            <div className="adm-modal-title">+ Nouveau compte back-office</div>
            <div className="adm-modal-form">
            <label className="adm-modal-label">Téléphone
              <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+2250700000000" />
            </label>
            <label className="adm-modal-label">Prénom
              <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
            </label>
            <label className="adm-modal-label">Nom
              <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
            </label>
            <label className="adm-modal-label">Mot de passe (4 à 6 caractères)
              <input className="adm-input" type="password" style={{ width: '100%', marginTop: 4 }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>Permissions</div>
            <PermissionPicker list={newPermissions} setList={setNewPermissions} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="adm-btn ghost" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Annuler</button>
              <button
                className="adm-btn"
                style={{ flex: 1 }}
                disabled={creating || !newPhone || !newFirstName || !newLastName || newPassword.length < 4 || newPassword.length > 6}
                onClick={submitCreate}
              >
                {creating ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="adm-modal-overlay" onClick={() => setEditing(null)}>
          <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-title">Permissions — {editing.firstName} {editing.lastName}</div>
            <PermissionPicker list={editPermissions} setList={setEditPermissions} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="adm-btn ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Annuler</button>
              <button className="adm-btn" style={{ flex: 1 }} disabled={saving} onClick={submitEdit}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
