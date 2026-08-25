'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';

interface QrRow {
  code: string;
  type: 'MERCHANT_STATIC' | 'MERCHANT_DYNAMIC';
  status: string;
  fixedAmount: number | null;
  expiresAt: string | null;
  createdAt: string;
}

interface LinkRow {
  slug: string;
  url: string;
  amount: number | null;
  status: string;
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'green',
  BLOCKED: 'red',
  EXPIRED: 'gray',
  UNASSIGNED: 'gray',
  ASSIGNED: 'amber',
};

export default function QrPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [codes, setCodes] = useState<QrRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) return;
    apiFetch<QrRow[]>(`/merchants/${activeMerchant.merchantId}/qr`).then(setCodes);
    apiFetch<LinkRow[]>(`/merchants/${activeMerchant.merchantId}/payment-links`).then(setLinks);
  }, [user, loading, activeMerchant, router]);

  if (loading || !user || !activeMerchant) return null;

  return (
    <MerchantShell title="QR Codes & Payment Links">
      <div className="mc-panel" style={{ marginBottom: 20 }}>
        <div className="mc-panel-header">QR Codes</div>
        <table className="mc-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Montant fixe</th>
              <th>Statut</th>
              <th>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: '#5a7a94', textAlign: 'center', padding: 20 }}>
                  Aucun QR généré.
                </td>
              </tr>
            ) : (
              codes.map((qr) => (
                <tr key={qr.code}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{qr.code}</td>
                  <td>{qr.type === 'MERCHANT_STATIC' ? 'Permanent' : 'Dynamique'}</td>
                  <td>{qr.fixedAmount ? `${(qr.fixedAmount / 100).toLocaleString('fr-FR')} FCFA` : '—'}</td>
                  <td>
                    <span className={`mc-badge ${STATUS_CLASS[qr.status] ?? 'gray'}`}>{qr.status}</span>
                  </td>
                  <td>{new Date(qr.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mc-panel">
        <div className="mc-panel-header">Payment Links</div>
        <table className="mc-table">
          <thead>
            <tr>
              <th>Lien</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: '#5a7a94', textAlign: 'center', padding: 20 }}>
                  Aucun lien créé.
                </td>
              </tr>
            ) : (
              links.map((link) => (
                <tr key={link.slug}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{link.url}</td>
                  <td>{link.amount ? `${(link.amount / 100).toLocaleString('fr-FR')} FCFA` : 'Libre'}</td>
                  <td>
                    <span className={`mc-badge ${STATUS_CLASS[link.status] ?? 'gray'}`}>{link.status}</span>
                  </td>
                  <td>{new Date(link.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </MerchantShell>
  );
}
