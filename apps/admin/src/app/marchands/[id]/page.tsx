'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import AdminShell from '../../../components/AdminShell';

interface MerchantDetail {
  id: string;
  businessName: string;
  legalName: string | null;
  category: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  feeRateBps: number;
  transfersEnabled: boolean;
  wallet: { cachedBalance: number; pendingBalance: number } | null;
  agent: { user: { firstName: string; lastName: string; phone: string } } | null;
  users: Array<{
    id: string;
    userId: string;
    role: string;
    user: { firstName: string; lastName: string; phone: string };
  }>;
  kycDossiers: Array<{
    id: string;
    status: string;
    documentType: string;
    documentRef: string;
    createdAt: string;
  }>;
  qrCodes: Array<{ code: string; type: string; status: string }>;
}

export default function MerchantDetailPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const merchantId = params.id as string;

  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinTargetUserId, setPinTargetUserId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const load = () => apiFetch<MerchantDetail>(`/admin/merchants/${merchantId}`).then(setMerchant);

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router, merchantId]);

  const changeStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/merchants/${merchantId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const reviewKyc = async (dossierId: string, approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/kyc/${dossierId}/review`, {
        method: 'POST',
        body: JSON.stringify({ approve, rejectReason: approve ? undefined : 'Rejeté par l\'admin' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const toggleTransfers = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/merchants/${merchantId}/transfers-enabled`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: enabled }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    if (!pinTargetUserId || !/^\d{4,6}$/.test(newPin)) return;
    setPinSaving(true);
    setPinError(null);
    setPinMessage(null);
    try {
      await apiFetch(`/admin/users/${pinTargetUserId}/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ newPin }),
      });
      setPinMessage('Code secret défini avec succès.');
      setNewPin('');
      setPinTargetUserId(null);
    } catch (err) {
      setPinError(err instanceof ApiError ? err.message : 'Échec de la définition du code secret.');
    } finally {
      setPinSaving(false);
    }
  };

  if (loading || !admin || !merchant) return null;

  const pendingKyc = merchant.kycDossiers.find((d) => d.status === 'PENDING');

  return (
    <AdminShell title={merchant.businessName}>
      <Link href="/marchands" style={{ color: '#8a97b3', fontSize: 13, textDecoration: 'none' }}>
        ← Retour à la liste
      </Link>

      <div style={{ marginTop: 16, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span
          className={`adm-badge ${
            merchant.status === 'ACTIVE' ? 'green' : merchant.status === 'SUSPENDED' ? 'red' : 'amber'
          }`}
        >
          {merchant.status}
        </span>
        {merchant.status === 'ACTIVE' && (
          <button className="adm-btn danger" disabled={busy} onClick={() => changeStatus('SUSPENDED')}>
            Suspendre
          </button>
        )}
        {(merchant.status === 'SUSPENDED' || merchant.status === 'PENDING') && !pendingKyc && (
          <button className="adm-btn" disabled={busy} onClick={() => changeStatus('ACTIVE')}>
            Activer
          </button>
        )}
      </div>

      {error && <div className="adm-error" style={{ marginBottom: 16 }}>{error}</div>}

      {pendingKyc && (
        <div className="adm-panel" style={{ padding: 16, marginBottom: 20, borderColor: '#f59e0b' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 Dossier KYC en attente de revue</div>
          <div style={{ fontSize: 13, color: '#8a97b3', marginBottom: 12 }}>
            {pendingKyc.documentType} — {pendingKyc.documentRef}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="adm-btn" disabled={busy} onClick={() => reviewKyc(pendingKyc.id, true)}>
              ✓ Approuver (active le marchand)
            </button>
            <button className="adm-btn danger" disabled={busy} onClick={() => reviewKyc(pendingKyc.id, false)}>
              ✗ Rejeter
            </button>
          </div>
        </div>
      )}

      <div className="adm-detail-grid">
        <div className="adm-panel" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Informations</div>
          <div className="adm-kv">
            <span>Nom légal</span>
            <span>{merchant.legalName ?? '—'}</span>
          </div>
          <div className="adm-kv">
            <span>Catégorie</span>
            <span>{merchant.category ?? '—'}</span>
          </div>
          <div className="adm-kv">
            <span>Frais MobilePay</span>
            <span>{merchant.feeRateBps / 100}%</span>
          </div>
          <div className="adm-kv">
            <span>Agent responsable</span>
            <span>
              {merchant.agent
                ? `${merchant.agent.user.firstName} ${merchant.agent.user.lastName}`
                : '—'}
            </span>
          </div>
        </div>

        <div className="adm-panel" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Wallet</div>
          <div className="adm-kv">
            <span>Solde disponible</span>
            <span>{merchant.wallet ? `${(merchant.wallet.cachedBalance / 100).toLocaleString('fr-FR')} FCFA` : '—'}</span>
          </div>
          <div className="adm-kv">
            <span>Fonds en attente</span>
            <span>{merchant.wallet ? `${(merchant.wallet.pendingBalance / 100).toLocaleString('fr-FR')} FCFA` : '—'}</span>
          </div>
          <div className="adm-kv">
            <span>Transferts sortants</span>
            <span className={`adm-badge ${merchant.transfersEnabled ? 'green' : 'gray'}`}>
              {merchant.transfersEnabled ? 'Autorisés' : 'Non autorisés'}
            </span>
          </div>
          <button
            className="adm-btn"
            style={{ marginTop: 10, width: '100%' }}
            disabled={busy}
            onClick={() => toggleTransfers(!merchant.transfersEnabled)}
          >
            {merchant.transfersEnabled ? 'Révoquer les transferts' : 'Autoriser les transferts'}
          </button>
        </div>
      </div>

      <div className="adm-panel" style={{ padding: 16, marginTop: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>QR Codes</div>
        {merchant.qrCodes.length === 0 ? (
          <p style={{ color: '#8a97b3', fontSize: 13 }}>Aucun QR généré.</p>
        ) : (
          merchant.qrCodes.map((qr) => (
            <div className="adm-kv" key={qr.code}>
              <span>{qr.code} ({qr.type})</span>
              <span className={`adm-badge ${qr.status === 'ACTIVE' ? 'green' : 'gray'}`}>{qr.status}</span>
            </div>
          ))
        )}
      </div>
      <div className="adm-panel" style={{ padding: 16, marginTop: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>👥 Utilisateurs (propriétaire / collaborateurs)</div>
        {merchant.users.length === 0 ? (
          <p style={{ color: '#8a97b3', fontSize: 13 }}>Aucun utilisateur lié.</p>
        ) : (
          merchant.users.map((mu) => (
            <div key={mu.id} style={{ borderBottom: '1px solid var(--adm-border)', padding: '10px 0' }}>
              <div className="adm-kv">
                <span>{mu.user.firstName} {mu.user.lastName} — {mu.user.phone} ({mu.role})</span>
                {pinTargetUserId !== mu.userId && (
                  <button
                    className="adm-btn ghost"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => { setPinTargetUserId(mu.userId); setNewPin(''); setPinError(null); setPinMessage(null); }}
                  >
                    🔒 Définir le code secret
                  </button>
                )}
              </div>
              {pinTargetUserId === mu.userId && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
                  <input
                    className="adm-input"
                    style={{ flex: 1, letterSpacing: 4 }}
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nouveau code (4-6 chiffres)"
                    autoFocus
                  />
                  <button
                    className="adm-btn"
                    disabled={pinSaving || !/^\d{4,6}$/.test(newPin)}
                    onClick={submitPin}
                  >
                    {pinSaving ? '...' : 'Valider'}
                  </button>
                  <button className="adm-btn ghost" onClick={() => setPinTargetUserId(null)}>
                    Annuler
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {pinError && <div className="adm-error" style={{ marginTop: 8 }}>{pinError}</div>}
        {pinMessage && <div style={{ color: 'var(--adm-accent)', fontSize: 12.5, marginTop: 8 }}>✓ {pinMessage}</div>}
      </div>
    </AdminShell>
  );
}
