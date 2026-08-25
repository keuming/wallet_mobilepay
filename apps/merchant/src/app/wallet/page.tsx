'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';

interface WalletDetail {
  cachedBalance: number;
  pendingBalance: number;
  feesThisMonth: number;
  recentSettlements: Array<{
    id: string;
    amount: number;
    status: string;
    periodFrom: string;
    periodTo: string;
    paidAt: string | null;
  }>;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
}

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

const SETTLEMENT_STATUS_CLASS: Record<string, string> = {
  SUCCESS: 'green',
  PENDING: 'amber',
  PROCESSING: 'amber',
  FAILED: 'red',
};

export default function WalletPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<WalletDetail | null>(null);
  const [movements, setMovements] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) return;
    apiFetch<WalletDetail>(`/merchants/${activeMerchant.merchantId}/wallet-detail`).then(setDetail);
    apiFetch<{ entries: LedgerEntry[] }>(
      `/merchants/${activeMerchant.merchantId}/transactions?pageSize=15`,
    ).then((res) => setMovements(res.entries));
  }, [user, loading, activeMerchant, router]);

  if (loading || !user || !activeMerchant) return null;

  return (
    <MerchantShell title="Wallet">
      {detail && (
        <div className="mc-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="mc-stat-card">
            <div className="mc-stat-label">Solde disponible</div>
            <div className="mc-stat-value">{fcfa(detail.cachedBalance)}</div>
          </div>
          <div className="mc-stat-card">
            <div className="mc-stat-label">Fonds en attente</div>
            <div className="mc-stat-value">{fcfa(detail.pendingBalance)}</div>
          </div>
          <div className="mc-stat-card">
            <div className="mc-stat-label">Frais MobilePay (ce mois)</div>
            <div className="mc-stat-value">{fcfa(detail.feesThisMonth)}</div>
          </div>
        </div>
      )}

      <div className="mc-panel" style={{ marginBottom: 20 }}>
        <div className="mc-panel-header">Mouvements récents</div>
        <table className="mc-table">
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td style={{ color: '#5a7a94', textAlign: 'center', padding: 20 }}>
                  Aucun mouvement pour le moment.
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: m.type === 'CREDIT' ? '#0a8f58' : '#c0442c' }}>
                    {m.type === 'CREDIT' ? '+' : '−'} {fcfa(m.amount)}
                  </td>
                  <td style={{ color: '#5a7a94', textAlign: 'right', width: 140 }}>
                    {new Date(m.createdAt).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mc-panel">
        <div className="mc-panel-header">Règlements</div>
        <table className="mc-table">
          <thead>
            <tr>
              <th>Période</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Payé le</th>
            </tr>
          </thead>
          <tbody>
            {!detail || detail.recentSettlements.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: '#5a7a94', textAlign: 'center', padding: 20 }}>
                  Aucun règlement effectué pour le moment. Les règlements sont initiés par
                  l'administrateur MobilePay selon la périodicité convenue.
                </td>
              </tr>
            ) : (
              detail.recentSettlements.map((s) => (
                <tr key={s.id}>
                  <td>
                    {new Date(s.periodFrom).toLocaleDateString('fr-FR')} –{' '}
                    {new Date(s.periodTo).toLocaleDateString('fr-FR')}
                  </td>
                  <td>{fcfa(s.amount)}</td>
                  <td>
                    <span className={`mc-badge ${SETTLEMENT_STATUS_CLASS[s.status] ?? 'gray'}`}>{s.status}</span>
                  </td>
                  <td>{s.paidAt ? new Date(s.paidAt).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </MerchantShell>
  );
}
