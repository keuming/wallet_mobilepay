'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface PendingRefund {
  id: string;
  amount: string;
  feeAmount: string;
  totalCollected: string;
  operatorId: string | null;
  createdAt: string;
  payerPhone: string | null;
  payerProvider: string | null;
  providerRef: string | null;
}

function fcfa(v: string | number): string {
  return (Number(v) / 100).toLocaleString('fr-FR');
}

const OPERATOR_LABELS: Record<string, string> = {
  '252': "Orange Cote d'Ivoire",
  '253': "MTN Cote d'Ivoire",
  '254': "Moov Cote d'Ivoire",
};

export default function RemboursementsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();

  const [refunds, setRefunds] = useState<PendingRefund[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !admin) router.push('/login');
  }, [loading, admin, router]);

  const load = () => {
    setLoadingList(true);
    setError(null);
    apiFetch<PendingRefund[]>('/admin/refunds/pending')
      .then(setRefunds)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Impossible de charger la liste.'))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    if (admin) load();
  }, [admin]);

  const handleProcess = async (id: string) => {
    setProcessingId(id);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await apiFetch<{ success: boolean; amountRefunded: string }>(
        '/admin/refunds/' + id + '/process',
        { method: 'POST' },
      );
      setSuccessMessage('Remboursement de ' + fcfa(result.amountRefunded) + ' FCFA envoye avec succes.');
      setConfirmingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le remboursement n'a pas pu etre declenche.");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading || !admin) return null;

  const totalDu = refunds.reduce((sum, r) => sum + Number(r.totalCollected), 0);
  return (
    <AdminShell title="Remboursements">
      <div style={{ padding: '24px 32px', maxWidth: 980 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
          Remboursements en attente
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Paiements collectes par HUB2 dont la livraison Reloadly a echoue - argent du client a restituer.
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

        {!loadingList && refunds.length > 0 && (
          <div style={{ background: '#0f2d52', borderRadius: 12, padding: '16px 20px', marginBottom: 20, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>
              {refunds.length} remboursement{refunds.length > 1 ? 's' : ''} en attente
            </span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>
              {fcfa(totalDu)} FCFA
            </span>
          </div>
        )}

        {loadingList ? (
          <p style={{ color: '#64748b' }}>Chargement...</p>
        ) : refunds.length === 0 ? (
          <p style={{ color: '#64748b' }}>Aucun remboursement en attente.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {refunds.map((r) => (
              <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
                      {fcfa(r.totalCollected)} FCFA
                      <span style={{ fontWeight: 400, fontSize: 13, color: '#64748b', marginLeft: 8 }}>
                        (credit {fcfa(r.amount)} + frais {fcfa(r.feeAmount)})
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      Vers <strong>{r.payerPhone ?? 'numero inconnu'}</strong> via <strong>{r.payerProvider ? r.payerProvider.toUpperCase() : '-'}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Operateur destine : {OPERATOR_LABELS[r.operatorId ?? ''] ?? r.operatorId ?? '-'} - {new Date(r.createdAt).toLocaleString('fr-FR')}
                    </div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                      Ref. HUB2 : {r.providerRef}
                    </div>
                  </div>

                  {confirmingId === r.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                        Confirmer l'envoi de {fcfa(r.totalCollected)} FCFA ?
                      </span>
                      <button onClick={() => handleProcess(r.id)} disabled={processingId === r.id} style={{ background: '#00D27A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        {processingId === r.id ? 'Envoi...' : 'Oui, rembourser'}
                      </button>
                      <button onClick={() => setConfirmingId(null)} disabled={processingId === r.id} style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingId(r.id)} disabled={!r.payerPhone} style={{ background: r.payerPhone ? '#0f2d52' : '#e2e8f0', color: r.payerPhone ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: r.payerPhone ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                      {r.payerPhone ? 'Rembourser' : 'Donnees incompletes'}
                    </button>
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
