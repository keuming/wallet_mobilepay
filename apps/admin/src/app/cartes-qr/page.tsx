'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface QrBatch {
  id: string;
  label: string;
  quantity: number;
  createdAt: string;
  assignedAgent: string | null;
  linkedCount: number;
  totalCount: number;
}

interface AgentOption {
  id: string;
  user: { firstName: string; lastName: string; phone: string };
}

export default function CartesQrPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();

  const [batches, setBatches] = useState<QrBatch[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('50');
  const [creating, setCreating] = useState(false);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [assigningBatchId, setAssigningBatchId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!loading && !admin) router.push('/login');
  }, [loading, admin, router]);

  const load = () => {
    setLoadingList(true);
    apiFetch<QrBatch[]>('/admin/qr-batches')
      .then(setBatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Impossible de charger les lots.'))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    if (admin) {
      load();
      apiFetch<{ agents: { id: string; merchants?: number; user: { firstName: string; lastName: string; phone: string } }[] }>('/admin/agents').then((r) => setAgents(r.agents ?? [])).catch(() => {});
    }
  }, [admin]);

  const handleCreate = async () => {
    if (!label.trim() || !quantity) return;
    setCreating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await apiFetch('/admin/qr-batches', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ label: label.trim(), quantity: Number(quantity) }),
      });
      setSuccessMessage(`Lot "${label}" cree avec ${quantity} carte(s).`);
      setLabel('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le lot n'a pas pu etre cree.");
    } finally {
      setCreating(false);
    }
  };

  const handleAssign = async (batchId: string) => {
    if (!selectedAgentId) return;
    setAssigning(true);
    setError(null);
    try {
      await apiFetch(`/admin/qr-batches/${batchId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      setSuccessMessage('Lot assigne avec succes.');
      setAssigningBatchId(null);
      setSelectedAgentId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'assignation a echoue.");
    } finally {
      setAssigning(false);
    }
  };

  if (loading || !admin) return null;
  return (
    <AdminShell title="Cartes QR">
      <div style={{ padding: '24px 32px', maxWidth: 980 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
          Cartes QR pre-imprimees
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Genere des lots de cartes vierges, assigne-les a un agent, qui les lie ensuite aux marchands sur le terrain.
        </p>

        {successMessage && (
          <div style={{ background: '#ecfdf5', border: '1px solid #00D27A', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#065f46', fontSize: 14, fontWeight: 600 }}>
            OK - {successMessage}
          </div>
        )}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px', marginBottom: 24, background: '#fff' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Generer un nouveau lot</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Nom du lot</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="LOT-ABIDJAN-OCT" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', width: 220 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Quantite</label>
              <input type="number" min="1" max="5000" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', width: 100 }} />
            </div>
            <button onClick={handleCreate} disabled={creating || !label.trim()} style={{ background: '#0f2d52', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {creating ? 'Generation...' : 'Generer le lot'}
            </button>
          </div>
        </div>

        {loadingList ? (
          <p style={{ color: '#64748b' }}>Chargement...</p>
        ) : batches.length === 0 ? (
          <p style={{ color: '#64748b' }}>Aucun lot genere pour le moment.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {batches.map((b) => (
              <div key={b.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{b.label}</div>
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                      {b.linkedCount} / {b.totalCount} cartes liees
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      {b.assignedAgent ? `Assigne a ${b.assignedAgent}` : 'Non assigne'} - {new Date(b.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  {!b.assignedAgent && (
                    assigningBatchId === b.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                          <option value="">Choisir un agent...</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.user.firstName} {a.user.lastName} ({a.user.phone})</option>
                          ))}
                        </select>
                        <button onClick={() => handleAssign(b.id)} disabled={assigning || !selectedAgentId} style={{ background: '#00D27A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          {assigning ? '...' : 'Confirmer'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAssigningBatchId(b.id)} style={{ background: '#0f2d52', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        Assigner a un agent
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
