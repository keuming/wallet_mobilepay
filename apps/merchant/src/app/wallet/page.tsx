'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
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
  const [showTransfer, setShowTransfer] = useState(false);
  const [toPhone, setToPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const load = () => {
    if (!activeMerchant) return;
    apiFetch<WalletDetail>(`/merchants/${activeMerchant.merchantId}/wallet-detail`).then(setDetail);
    apiFetch<{ entries: LedgerEntry[] }>(
      `/merchants/${activeMerchant.merchantId}/transactions?pageSize=15`,
    ).then((res) => setMovements(res.entries));
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, activeMerchant, router]);

  const submitTransfer = async () => {
    if (!activeMerchant) return;
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      await apiFetch(`/merchants/${activeMerchant.merchantId}/transfer`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          toPhone,
          amount: Math.round(Number(amount) * 100),
          description: description || undefined,
        }),
      });
      setFormSuccess('Transfert effectué ✓');
      setToPhone('');
      setAmount('');
      setDescription('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Le transfert a échoué.');
    } finally {
      setSubmitting(false);
    }
  };

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

      {activeMerchant.transfersEnabled ? (
        <div className="mc-panel" style={{ marginBottom: 20 }}>
          <div className="mc-panel-header">↗️ Transférer de l'argent</div>
          {!showTransfer ? (
            <div style={{ padding: 16 }}>
              <button className="mc-btn" onClick={() => setShowTransfer(true)}>
                Nouveau transfert
              </button>
            </div>
          ) : (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
              <input
                className="mc-input"
                placeholder="Numéro du bénéficiaire (+225...)"
                value={toPhone}
                onChange={(e) => setToPhone(e.target.value)}
              />
              <input
                className="mc-input"
                type="number"
                placeholder="Montant (FCFA)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                className="mc-input"
                placeholder="Motif (optionnel)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {formError && <div className="mc-error">{formError}</div>}
              {formSuccess && <div style={{ color: 'var(--mc-green)', fontSize: 13, fontWeight: 600 }}>{formSuccess}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="mc-btn ghost"
                  onClick={() => {
                    setShowTransfer(false);
                    setFormError(null);
                  }}
                >
                  Annuler
                </button>
                <button
                  className="mc-btn"
                  disabled={submitting || !toPhone || !amount}
                  onClick={submitTransfer}
                >
                  {submitting ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mc-panel" style={{ marginBottom: 20, padding: 16 }}>
          <p style={{ color: 'var(--mc-muted)', fontSize: 13, margin: 0 }}>
            🔒 Le transfert d'argent depuis ce wallet n'est pas autorisé pour le moment. Contactez un
            administrateur MobilePay pour l'activer.
          </p>
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
