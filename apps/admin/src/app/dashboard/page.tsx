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

function formatFcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function DashboardPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    apiFetch<DashboardStats>('/admin/dashboard').then(setStats);
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
    </AdminShell>
  );
}
