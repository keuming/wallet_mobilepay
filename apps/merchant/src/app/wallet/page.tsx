'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import MerchantSideMenu from '../../components/MerchantSideMenu';

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
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<WalletDetail | null>(null);
  const [movements, setMovements] = useState<LedgerEntry[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <div style={{ display: 'flex', gap: 6 }}>
            <Link href="/dashboard" className="mp-icon-btn" title="Accueil">
              🏠
            </Link>
            <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
              ☰
            </button>
          </div>
          <span className="mp-brand-mark">
            <span className="dot" />
            Wallet
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">
            ⏻
          </button>
        </div>
      </div>

      <MerchantSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-balance-card">
        <div className="mp-balance-label">💳 Solde disponible</div>
        <div className="mp-balance-amount">
          {detail ? fcfa(detail.cachedBalance) : '—'}
          <span className="currency">FCFA</span>
        </div>
      </div>

      {detail && (
        <div className="mp-feature-list" style={{ marginTop: 8 }}>
          <div className="mp-feature-card" style={{ cursor: 'default' }}>
            <div className="mp-feature-icon">⏳</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">{fcfa(detail.pendingBalance)} FCFA</div>
              <div className="mp-feature-sub">Fonds en attente de règlement</div>
            </div>
          </div>
          <div className="mp-feature-card" style={{ cursor: 'default' }}>
            <div className="mp-feature-icon">🧾</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">{fcfa(detail.feesThisMonth)} FCFA</div>
              <div className="mp-feature-sub">Frais MobilePay ce mois</div>
            </div>
          </div>
        </div>
      )}

      <div className="mp-section">
        <h3>↗️ Transférer de l'argent</h3>
        {activeMerchant.transfersEnabled ? (
          !showTransfer ? (
            <button className="mp-btn-primary" style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }} onClick={() => setShowTransfer(true)}>
              Nouveau transfert
            </button>
          ) : (
            <div className="mp-form" style={{ padding: 0 }}>
              <input className="mp-input" placeholder="Numéro du bénéficiaire (+225...)" value={toPhone} onChange={(e) => setToPhone(e.target.value)} />
              <input className="mp-input" type="number" placeholder="Montant (FCFA)" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input className="mp-input" placeholder="Motif (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} />
              {formError && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{formError}</div>}
              {formSuccess && <div style={{ color: 'var(--mp-green-dark)', fontSize: 13, fontWeight: 600 }}>{formSuccess}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="mp-btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--mp-border)', color: 'var(--mp-text)', boxShadow: 'none', flex: 1 }}
                  onClick={() => {
                    setShowTransfer(false);
                    setFormError(null);
                  }}
                >
                  Annuler
                </button>
                <button
                  className="mp-btn-primary"
                  style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)', flex: 1 }}
                  disabled={submitting || !toPhone || !amount}
                  onClick={submitTransfer}
                >
                  {submitting ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          )
        ) : (
          <p style={{ color: 'var(--mp-muted)', fontSize: 13 }}>
            🔒 Le transfert d'argent depuis ce wallet n'est pas autorisé pour le moment. Contactez un
            administrateur MobilePay pour l'activer.
          </p>
        )}
      </div>

      <div className="mp-section">
        <h3>📋 Mouvements récents</h3>
        {movements.length === 0 && <p style={{ color: 'var(--mp-muted)', fontSize: 14 }}>Aucun mouvement pour le moment.</p>}
        <div className="mp-history-list" style={{ padding: 0 }}>
          {movements.map((m) => (
            <div className="mp-history-card" key={m.id} style={{ cursor: 'default' }}>
              <div className="mp-history-row">
                <div className={`mp-history-avatar ${m.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                  {m.type === 'CREDIT' ? '↙' : '↗'}
                </div>
                <div className="mp-history-main">
                  <div className="mp-history-name">{m.description}</div>
                </div>
                <div className="mp-history-amount-block">
                  <div className={`mp-history-amount ${m.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                    {m.type === 'CREDIT' ? '+' : '−'} {fcfa(m.amount)} FCFA
                  </div>
                  <div className="mp-history-time">{new Date(m.createdAt).toLocaleDateString('fr-FR')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mp-section">
        <h3>🏦 Règlements</h3>
        {!detail || detail.recentSettlements.length === 0 ? (
          <p style={{ color: 'var(--mp-muted)', fontSize: 13 }}>
            Aucun règlement effectué pour le moment. Les règlements sont initiés par l'administrateur
            MobilePay selon la périodicité convenue.
          </p>
        ) : (
          <div className="mp-history-list" style={{ padding: 0 }}>
            {detail.recentSettlements.map((s) => (
              <div className="mp-history-card" key={s.id} style={{ cursor: 'default' }}>
                <div className="mp-history-row">
                  <div className="mp-history-avatar credit">🏦</div>
                  <div className="mp-history-main">
                    <div className="mp-history-name">
                      {new Date(s.periodFrom).toLocaleDateString('fr-FR')} – {new Date(s.periodTo).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="mp-history-sub">
                      {SETTLEMENT_LABEL[s.status] ?? s.status}
                      {s.paidAt ? ` · payé le ${new Date(s.paidAt).toLocaleDateString('fr-FR')}` : ''}
                    </div>
                  </div>
                  <div className="mp-history-amount-block">
                    <div className="mp-history-amount credit">{fcfa(s.amount)} FCFA</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
