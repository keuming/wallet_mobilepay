'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

export const STATUS_CLASS: Record<string, string> = {
  SUCCESS: 'green',
  FAILED: 'red',
  CANCELLED: 'red',
  EXPIRED: 'gray',
  PENDING: 'amber',
  PROCESSING: 'amber',
  INITIATED: 'amber',
  REFUNDED: 'gray',
};

interface TxDetail {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  feeAmount: number;
  currency: string;
  description: string | null;
  providerName: string | null;
  providerRef: string | null;
  failureReason: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  externalPayerPhone: string | null;
  initiatedByUser: { phone: string; firstName: string; lastName: string } | null;
  sourceWallet: {
    user: { phone: string; firstName: string; lastName: string } | null;
    merchant: { businessName: string } | null;
  } | null;
  destWallet: {
    user: { phone: string; firstName: string; lastName: string } | null;
    merchant: { businessName: string } | null;
  } | null;
  paymentAttempts: Array<{
    id: string;
    providerName: string;
    status: string;
    providerRef: string | null;
    createdAt: string;
  }>;
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--mc-border)', fontSize: 13 }}>
      <span style={{ color: 'var(--mc-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-all', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}

/**
 * Modal de détail d'une transaction (§ back-office) — composant partagé
 * entre la page Transactions et le Tableau de bord, pour éviter de
 * dupliquer cette logique à chaque endroit où un historique est affiché.
 */
export default function TransactionDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<TxDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TxDetail>(`/admin/transactions/${id}`)
      .then(setDetail)
      .catch(() => setError('Impossible de charger le détail de cette transaction.'));
  }, [id]);

  // Le payeur réel dépend du circuit : Mobile Money externe (HUB2) → numéro
  // capturé sur la tentative de paiement ; sinon → propriétaire du wallet
  // source (particulier ou marchand).
  const payerLabel = detail?.externalPayerPhone
    ? `${detail.externalPayerPhone} (Mobile Money externe)`
    : detail?.sourceWallet?.user
      ? `${detail.sourceWallet.user.firstName} ${detail.sourceWallet.user.lastName} (${detail.sourceWallet.user.phone})`
      : detail?.sourceWallet?.merchant
        ? `${detail.sourceWallet.merchant.businessName} (marchand)`
        : null;

  const recipientLabel = detail?.destWallet?.merchant
    ? `${detail.destWallet.merchant.businessName} (marchand)`
    : detail?.destWallet?.user
      ? `${detail.destWallet.user.firstName} ${detail.destWallet.user.lastName} (${detail.destWallet.user.phone})`
      : null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,45,82,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: 'var(--mc-navy)', fontSize: 16 }}>Détail de la transaction</h3>
          <button onClick={onClose} className="adm-btn ghost" style={{ padding: '4px 10px' }}>
            ✕
          </button>
        </div>

        {error && <div className="adm-error">{error}</div>}
        {!detail && !error && <div style={{ color: 'var(--mc-muted)', padding: 20, textAlign: 'center' }}>Chargement...</div>}

        {detail && (
          <>
            <div style={{ marginBottom: 16 }}>
              <span className={`adm-badge ${STATUS_CLASS[detail.status] ?? 'gray'}`}>{detail.status}</span>
            </div>
            <DetailRow label="Référence" value={detail.reference} />
            <DetailRow label="ID interne" value={detail.id} />
            <DetailRow label="Type" value={detail.type} />
            <DetailRow label="Montant" value={`${(detail.amount / 100).toLocaleString('fr-FR')} ${detail.currency}`} />
            <DetailRow label="Frais" value={`${(detail.feeAmount / 100).toLocaleString('fr-FR')} ${detail.currency}`} />
            <DetailRow label="Description" value={detail.description} />
            <DetailRow label="Payeur" value={payerLabel} />
            <DetailRow label="Destinataire" value={recipientLabel} />
            <DetailRow
              label="Initié par"
              value={detail.initiatedByUser ? `${detail.initiatedByUser.firstName} ${detail.initiatedByUser.lastName} (${detail.initiatedByUser.phone})` : null}
            />
            <DetailRow label="Fournisseur" value={detail.providerName} />
            <DetailRow label="Référence fournisseur" value={detail.providerRef} />
            <DetailRow label="Clé d'idempotence" value={detail.idempotencyKey} />
            <DetailRow label="Motif d'échec" value={detail.failureReason} />
            <DetailRow label="Créée le" value={new Date(detail.createdAt).toLocaleString('fr-FR')} />
            <DetailRow label="Mise à jour le" value={new Date(detail.updatedAt).toLocaleString('fr-FR')} />

            {detail.paymentAttempts.length > 0 && (
              <>
                <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 13, color: 'var(--mc-navy)' }}>
                  Tentatives de paiement ({detail.paymentAttempts.length})
                </h4>
                {detail.paymentAttempts.map((a) => (
                  <div key={a.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--mc-border)' }}>
                    {a.providerName} — {a.status} — {new Date(a.createdAt).toLocaleString('fr-FR')}
                    {a.providerRef && <div style={{ color: 'var(--mc-muted)', fontFamily: 'monospace' }}>{a.providerRef}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
