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
  return (cents / 100).toLocaleString('fr-FR');
}

const SETTLEMENT_LABEL: Record<string, string> = {
  SUCCESS: 'Payé',
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  FAILED: 'Échoué',
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
      <div className="mc-stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="mc-stat-card">
          <div className="mc-stat-label">Solde disponible</div>
          <div className="mc-stat-value">{detail ? fcfa(detail.cachedBalance) : '—'} FCFA</div>
        </div>
        <div className="mc-stat-card">
          <div className="mc-stat-label">En attente de règlement</div>
          <div className="mc-stat-value">{detail ? fcfa(detail.pendingBalance) : '—'} FCFA</div>
        </div>
        <div className="mc-stat-card">
          <div className="mc-stat-label">Frais MobilePay ce mois</div>
          <div className="mc-stat-value">{detail ? fcfa(detail.feesThisMonth) : '—'} FCFA</div>
        </div>
      </div>

      <div className="mc-panel" style={{ marginBottom: 20 }}>
        <div className="mc-panel-header">↗️ Transférer de l'argent</div>
        <div style={{ padding: 18 }}>
          {activeMerchant.transfersEnabled ? (
            !showTransfer ? (
              <button className="mc-btn" onClick={() => setShowTransfer(true)}>
                Nouveau transfert
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
                <input className="mc-input" placeholder="Numéro du bénéficiaire (+225...)" value={toPhone} onChange={(e) => setToPhone(e.target.value)} />
                <input className="mc-input" type="number" placeholder="Montant (FCFA)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <input className="mc-input" placeholder="Motif (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} />
                {formError && <div className="mc-error">{formError}</div>}
                {formSuccess && <div className="mc-success">{formSuccess}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="mc-btn ghost"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setShowTransfer(false);
                      setFormError(null);
                    }}
                  >
                    Annuler
                  </button>
                  <button className="mc-btn" style={{ flex: 1 }} disabled={submitting || !toPhone || !amount} onClick={submitTransfer}>
                    {submitting ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <p style={{ color: 'var(--mc-muted)', fontSize: 13 }}>
              🔒 Le transfert d'argent depuis ce wallet n'est pas autorisé pour le moment. Contactez un
              administrateur MobilePay pour l'activer.
            </p>
          )}
        </div>
      </div>

      <div className="mc-panel" style={{ marginBottom: 20 }}>
        <div className="mc-panel-header">📋 Mouvements récents</div>
        {movements.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)', fontSize: 13.5 }}>Aucun mouvement pour le moment.</div>
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
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.description}</td>
                  <td>
                    <span className={`mc-badge ${m.type === 'CREDIT' ? 'green' : 'red'}`}>
                      {m.type === 'CREDIT' ? 'Crédit' : 'Débit'}
                    </span>
                  </td>
                  <td>
                    {m.type === 'CREDIT' ? '+' : '−'} {fcfa(m.amount)} FCFA
                  </td>
                  <td>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mc-panel">
        <div className="mc-panel-header">🏦 Règlements</div>
        {!detail || detail.recentSettlements.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)', fontSize: 13 }}>
            Aucun règlement effectué pour le moment. Les règlements sont initiés par l'administrateur
            MobilePay selon la périodicité convenue.
          </div>
        ) : (
          <table className="mc-table">
            <thead>
              <tr>
                <th>Période</th>
                <th>Statut</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {detail.recentSettlements.map((s) => (
                <tr key={s.id}>
                  <td>
                    {new Date(s.periodFrom).toLocaleDateString('fr-FR')} – {new Date(s.periodTo).toLocaleDateString('fr-FR')}
                  </td>
                  <td>
                    <span className="mc-badge green">
                      {SETTLEMENT_LABEL[s.status] ?? s.status}
                      {s.paidAt ? ` · payé le ${new Date(s.paidAt).toLocaleDateString('fr-FR')}` : ''}
                    </span>
                  </td>
                  <td>{fcfa(s.amount)} FCFA</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MerchantShell>
  );
}
