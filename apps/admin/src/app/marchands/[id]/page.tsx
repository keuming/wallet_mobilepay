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
  wallet: { cachedBalance: number; pendingBalance: number } | null;
  agent: { user: { firstName: string; lastName: string; phone: string } } | null;
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
    </AdminShell>
  );
}
