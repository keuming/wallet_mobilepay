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

function formatFcfa(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('fr-FR');
}

export default function DashboardPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) {
      setFetching(false);
      return;
    }
    Promise.all([
      apiFetch<DashboardData>(`/merchants/${activeMerchant.merchantId}/dashboard`),
      apiFetch<{ entries: LedgerEntry[] }>(`/merchants/${activeMerchant.merchantId}/transactions?pageSize=10`),
    ])
      .then(([dash, tx]) => {
        setData(dash);
        setRecent(tx.entries);
      })
      .finally(() => setFetching(false));
  }, [user, loading, activeMerchant, router]);

  if (loading || !user) return null;

  if (!activeMerchant) {
    return (
      <MerchantShell title="Dashboard">
        <p style={{ color: 'var(--mc-muted)' }}>
          Aucun marchand rattaché à ce compte. Contactez un agent MobilePay pour créer votre établissement.
        </p>
      </MerchantShell>
    );
  }

  return (
    <MerchantShell title="Dashboard">
      {activeMerchant.status !== 'ACTIVE' && (
        <div
          style={{
            marginBottom: 20,
            background: '#fef3f0',
            border: '1px solid #f0c4b8',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--mc-red)',
          }}
        >
          Votre établissement est en statut <strong>{activeMerchant.status}</strong> — l'encaissement est
          désactivé tant que le dossier KYC n'est pas validé.
        </div>
      )}

      {fetching ? (
        <p style={{ color: 'var(--mc-muted)' }}>Chargement...</p>
      ) : (
        <>
          <div className="mc-stats-grid">
            <div className="mc-stat-card">
              <div className="mc-stat-label">Solde disponible</div>
              <div className="mc-stat-value">{data ? formatFcfa(data.availableBalance) : '—'} FCFA</div>
            </div>
            <div className="mc-stat-card">
              <div className="mc-stat-label">En attente de règlement</div>
              <div className="mc-stat-value">{data ? formatFcfa(data.pendingBalance) : '—'} FCFA</div>
            </div>
            <div className="mc-stat-card">
              <div className="mc-stat-label">Encaissé aujourd'hui</div>
              <div className="mc-stat-value">{data ? formatFcfa(data.todayCollections) : '—'} FCFA</div>
            </div>
            <div className="mc-stat-card">
              <div className="mc-stat-label">Encaissé ce mois</div>
              <div className="mc-stat-value">{data ? formatFcfa(data.monthCollections) : '—'} FCFA</div>
            </div>
          </div>

          <div className="mc-quick-actions">
            <Link href="/wallet" className="mc-quick-btn">💼 Wallet</Link>
            <Link href="/transactions" className="mc-quick-btn">📋 Historique</Link>
            <Link href="/carte" className="mc-quick-btn">💎 Carte virtuelle</Link>
            <a href="https://business.mobilepay-ci.com" className="mc-quick-btn">📲 Encaisser (app)</a>
          </div>

          <div className="mc-panel">
            <div className="mc-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Dernières transactions</span>
              <Link href="/transactions" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mc-green)' }}>
                Voir tout →
              </Link>
            </div>
            {recent.length === 0 ? (
              <div style={{ padding: 18, color: 'var(--mc-muted)', fontSize: 13.5 }}>Aucune transaction pour le moment.</div>
            ) : (
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Montant</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.description}</td>
                      <td>
                        <span className={`mc-badge ${entry.type === 'CREDIT' ? 'green' : 'red'}`}>
                          {entry.type === 'CREDIT' ? 'Crédit' : 'Débit'}
                        </span>
                      </td>
                      <td>
                        {entry.type === 'CREDIT' ? '+' : '−'} {formatFcfa(entry.amount)} FCFA
                      </td>
                      <td>{new Date(entry.createdAt).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </MerchantShell>
  );
}
