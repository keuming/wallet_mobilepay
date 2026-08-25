'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';

interface DashboardData {
  availableBalance: number;
  pendingBalance: number;
  todayCollections: number;
  monthCollections: number;
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

export default function DashboardPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) return;
    Promise.all([
      apiFetch<DashboardData>(`/merchants/${activeMerchant.merchantId}/dashboard`),
      apiFetch<{ entries: LedgerEntry[] }>(`/merchants/${activeMerchant.merchantId}/transactions?pageSize=5`),
    ]).then(([dash, tx]) => {
      setData(dash);
      setRecent(tx.entries);
    });
  }, [user, loading, activeMerchant, router]);

  if (loading || !user) return null;

  if (!activeMerchant) {
    return (
      <MerchantShell title="Accueil">
        <p style={{ color: '#5a7a94' }}>
          Aucun marchand rattaché à ce compte. Contactez un agent MobilePay pour créer votre établissement.
        </p>
      </MerchantShell>
    );
  }

  return (
    <MerchantShell title="Accueil">
      {activeMerchant.status !== 'ACTIVE' && (
        <div
          style={{
            background: '#fef3f0',
            border: '1px solid #f0c4b8',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            color: '#c0442c',
          }}
        >
          Votre établissement est en statut <strong>{activeMerchant.status}</strong> — l'encaissement est
          désactivé tant que le dossier KYC n'est pas validé par un administrateur.
        </div>
      )}

      {data && (
        <div className="mc-stats-grid">
          <div className="mc-stat-card">
            <div className="mc-stat-label">Solde disponible</div>
            <div className="mc-stat-value">{fcfa(data.availableBalance)}</div>
          </div>
          <div className="mc-stat-card">
            <div className="mc-stat-label">En attente</div>
            <div className="mc-stat-value">{fcfa(data.pendingBalance)}</div>
          </div>
          <div className="mc-stat-card">
            <div className="mc-stat-label">Encaissements du jour</div>
            <div className="mc-stat-value">{fcfa(data.todayCollections)}</div>
          </div>
          <div className="mc-stat-card">
            <div className="mc-stat-label">Encaissements du mois</div>
            <div className="mc-stat-value">{fcfa(data.monthCollections)}</div>
          </div>
        </div>
      )}

      <div className="mc-quick-actions">
        <Link href="/encaisser" className="mc-quick-btn">
          💰 Encaisser
        </Link>
        <Link href="/qr" className="mc-quick-btn">
          📱 Voir mes QR
        </Link>
        <Link href="/transactions" className="mc-quick-btn">
          📋 Transactions
        </Link>
        <Link href="/encaisser?tab=link" className="mc-quick-btn">
          🔗 Payment Link
        </Link>
      </div>

      <div className="mc-panel">
        <div className="mc-panel-header">Dernières transactions</div>
        <table className="mc-table">
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td style={{ color: '#5a7a94', textAlign: 'center', padding: 24 }}>
                  Aucune transaction pour le moment.
                </td>
              </tr>
            ) : (
              recent.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: entry.type === 'CREDIT' ? '#0a8f58' : '#c0442c' }}>
                    {entry.type === 'CREDIT' ? '+' : '−'} {fcfa(entry.amount)}
                  </td>
                  <td style={{ color: '#5a7a94', textAlign: 'right', width: 140 }}>
                    {new Date(entry.createdAt).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </MerchantShell>
  );
}
