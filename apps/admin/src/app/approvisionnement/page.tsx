'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const SERVICE_TYPES = [
  { value: 'WALLET_RECHARGE', label: 'Recharge wallet' },
  { value: 'AIRTIME_DATA', label: "Crédit d'appel et data" },
  { value: 'TRANSFER', label: "Transfert d'argent" },
  { value: 'CARD_LOAD', label: 'Rechargement carte virtuelle' },
  { value: 'BULK_PAYMENT', label: 'Bulk paiement' },
  { value: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { value: 'OTHER', label: 'Autre' },
];

interface FoundAccount {
  id: string; // userId ou merchantId selon le type
  label: string; // nom à afficher
  phone?: string;
}

interface FundingRecord {
  id: string;
  targetType: string;
  targetUserId: string | null;
  targetMerchantId: string | null;
  accountLabel: string;
  amount: number;
  serviceType: string;
  note: string | null;
  proofFileName: string;
  proofMimeType: string;
  createdAt: string;
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

export default function ApprovisionnementPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();

  const [targetType, setTargetType] = useState<'PARTICULIER' | 'MERCHANT'>('PARTICULIER');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FoundAccount[]>([]);
  const [selected, setSelected] = useState<FoundAccount | null>(null);

  const [amount, setAmount] = useState('');
  const [serviceType, setServiceType] = useState('WALLET_RECHARGE');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [history, setHistory] = useState<FundingRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = () => {
    setHistoryLoading(true);
    apiFetch<{ items: FundingRecord[] }>('/admin/manual-funding')
      .then((res) => setHistory(res.items))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  const doSearch = async () => {
    if (!search) return;
    setSearching(true);
    setSelected(null);
    try {
      if (targetType === 'PARTICULIER') {
        const res = await apiFetch<{ users: Array<{ id: string; firstName: string; lastName: string; phone: string }> }>(
          `/admin/users?search=${encodeURIComponent(search)}`,
        );
        setResults(res.users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}`, phone: u.phone })));
      } else {
        const res = await apiFetch<{ merchants: Array<{ id: string; businessName: string }> }>(
          `/admin/merchants?search=${encodeURIComponent(search)}`,
        );
        setResults(res.merchants.map((m) => ({ id: m.id, label: m.businessName })));
      }
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!selected || !amount || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('targetType', targetType);
      if (targetType === 'PARTICULIER') formData.append('targetUserId', selected.id);
      else formData.append('targetMerchantId', selected.id);
      formData.append('amount', String(Math.round(Number(amount) * 100)));
      formData.append('serviceType', serviceType);
      if (note) formData.append('note', note);
      formData.append('proof', file);

      const token = localStorage.getItem('mp_admin_access_token');
      const res = await fetch(`${API_URL}/admin/manual-funding`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(json?.error?.message ?? "Échec de l'enregistrement.", res.status);
      }

      setToast('Approvisionnement enregistré avec succès ! 🎉');
      setTimeout(() => setToast(null), 4000);
      setSelected(null);
      setSearch('');
      setResults([]);
      setAmount('');
      setNote('');
      setFile(null);
      loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !admin) return null;

  return (
    <AdminShell title="Approvisionnement">
      {toast && (
        <div style={{ background: 'rgba(18,179,116,.1)', border: '1px solid var(--mc-green)', color: 'var(--mc-green-dark, #0d7a4f)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontWeight: 600, fontSize: 13.5 }}>
          {toast}
        </div>
      )}

      <p style={{ color: 'var(--mc-muted)', fontSize: 13.5, margin: '0 0 20px', maxWidth: 640 }}>
        Enregistre un approvisionnement manuel (dépôt espèces, virement, chèque reçu hors plateforme) —
        le compte sélectionné sera crédité immédiatement, avec le justificatif joint conservé pour
        traçabilité.
      </p>

      <div className="mc-panel" style={{ maxWidth: 520, marginBottom: 28 }}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="mc-btn"
              style={{ flex: 1, opacity: targetType === 'PARTICULIER' ? 1 : 0.5 }}
              onClick={() => {
                setTargetType('PARTICULIER');
                setSelected(null);
                setResults([]);
              }}
            >
              👤 Particulier
            </button>
            <button
              className="mc-btn"
              style={{ flex: 1, opacity: targetType === 'MERCHANT' ? 1 : 0.5 }}
              onClick={() => {
                setTargetType('MERCHANT');
                setSelected(null);
                setResults([]);
              }}
            >
              🏪 Marchand
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="mc-input"
              style={{ flex: 1 }}
              placeholder={targetType === 'PARTICULIER' ? 'Rechercher par nom ou numéro' : 'Rechercher par nom'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            />
            <button className="mc-btn ghost" onClick={doSearch} disabled={searching || !search}>
              {searching ? '...' : '🔍'}
            </button>
          </div>

          {results.length > 0 && !selected && (
            <div style={{ border: '1px solid var(--mc-border)', borderRadius: 8, overflow: 'hidden' }}>
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelected(r);
                    setResults([]);
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'white', border: 'none', borderBottom: '1px solid var(--mc-border)', cursor: 'pointer', fontSize: 13 }}
                >
                  {r.label} {r.phone && <span style={{ color: 'var(--mc-muted)' }}>({r.phone})</span>}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ background: '#f4f7f6', borderRadius: 8, padding: '8px 12px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✓ {selected.label} {selected.phone && `(${selected.phone})`}</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--mc-red)', cursor: 'pointer', fontSize: 12 }}>
                Changer
              </button>
            </div>
          )}

          <input className="mc-input" type="number" placeholder="Montant (FCFA)" value={amount} onChange={(e) => setAmount(e.target.value)} />

          <select className="mc-input" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
            {SERVICE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <input className="mc-input" placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />

          <label style={{ fontSize: 12, color: 'var(--mc-muted)', fontWeight: 600 }}>
            Justificatif (image ou PDF)
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: 'block', marginTop: 6, fontSize: 13 }}
            />
          </label>

          {error && <div className="mc-error">{error}</div>}

          <button
            className="mc-btn"
            disabled={submitting || !selected || !amount || !file}
            onClick={submit}
          >
            {submitting ? 'Enregistrement...' : 'Enregistrer l\'approvisionnement'}
          </button>
        </div>
      </div>

      <div className="mc-panel">
        <div className="mc-panel-header">Historique</div>
        {historyLoading ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)' }}>Chargement...</div>
        ) : history.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)' }}>Aucun approvisionnement enregistré.</div>
        ) : (
          <table className="mc-table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Service</th>
                <th>Montant</th>
                <th>Justificatif</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.targetType === 'PARTICULIER' ? '👤' : '🏪'} {h.accountLabel}</td>
                  <td>{SERVICE_TYPES.find((s) => s.value === h.serviceType)?.label ?? h.serviceType}</td>
                  <td>{fcfa(h.amount)} FCFA</td>
                  <td>
                    <a
                      href={`${API_URL}/admin/manual-funding/${h.id}/proof`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--mc-green)', fontWeight: 600 }}
                    >
                      📎 {h.proofFileName}
                    </a>
                  </td>
                  <td>{new Date(h.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
