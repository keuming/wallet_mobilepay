'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface DashboardStats {
  usersCount: number;
  merchantsCount: number;
  activeMerchantsCount: number;
  agentsCount: number;
  transactionsToday: number;
  volumeToday: number;
  failureRatePercent: number;
  qrActivatedCount: number;
}

interface TxRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  feeAmount: number;
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  SUCCESS: 'green',
  FAILED: 'red',
  CANCELLED: 'red',
  EXPIRED: 'gray',
  PENDING: 'amber',
  PROCESSING: 'amber',
  INITIATED: 'amber',
  REFUNDED: 'gray',
};

function formatFcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function DashboardPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTx, setRecentTx] = useState<TxRow[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    apiFetch<DashboardStats>('/admin/dashboard').then(setStats);
    apiFetch<{ transactions: TxRow[] }>('/admin/transactions?page=1').then((res) =>
      setRecentTx(res.transactions.slice(0, 10)),
    );
  }, [admin, loading, router]);

  if (loading || !admin) return null;

  return (
    <AdminShell title="MobilePay Admin">
      {!stats ? (
        <p style={{ color: '#8a97b3' }}>Chargement...</p>
      ) : (
        <div className="adm-stats-grid">
          <div className="adm-stat-card">
            <div className="adm-stat-label">Utilisateurs</div>
            <div className="adm-stat-value">{stats.usersCount.toLocaleString('fr-FR')}</div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">Marchands</div>
            <div className="adm-stat-value">{stats.merchantsCount.toLocaleString('fr-FR')}</div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">Marchands actifs</div>
            <div className="adm-stat-value">{stats.activeMerchantsCount.toLocaleString('fr-FR')}</div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">Agents</div>
            <div className="adm-stat-value">{stats.agentsCount.toLocaleString('fr-FR')}</div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">Transactions aujourd'hui</div>
            <div className="adm-stat-value">{stats.transactionsToday.toLocaleString('fr-FR')}</div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">Volume aujourd'hui</div>
            <div className="adm-stat-value">{formatFcfa(stats.volumeToday)}</div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">Transactions en échec</div>
            <div className={`adm-stat-value ${stats.failureRatePercent > 5 ? 'danger' : ''}`}>
              {stats.failureRatePercent}%
            </div>
          </div>
          <div className="adm-stat-card">
            <div className="adm-stat-label">QR activés</div>
            <div className="adm-stat-value">{stats.qrActivatedCount.toLocaleString('fr-FR')}</div>
          </div>
        </div>
      )}

      <div className="adm-section-title">📋 Historique des transactions</div>
      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Type</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentTx.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Aucune transaction pour le moment.
                </td>
              </tr>
            ) : (
              recentTx.map((tx) => (
                <tr key={tx.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{tx.reference}</td>
                  <td>{tx.type}</td>
                  <td>{formatFcfa(tx.amount)}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_CLASS[tx.status] ?? 'gray'}`}>{tx.status}</span>
                  </td>
                  <td style={{ color: 'var(--adm-muted)', fontSize: 12.5 }}>
                    {new Date(tx.createdAt).toLocaleString('fr-FR')}
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
