'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface PricingConfig {
  key: string;
  label: string;
  percentageBps: number;
  flatFeeCents: string; // BigInt sérialisé en string par Prisma/JSON
  updatedAt: string;
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

export default function TarificationPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [percentage, setPercentage] = useState('1');
  const [flatFee, setFlatFee] = useState('100');
  const [label, setLabel] = useState('');
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !admin) router.replace('/login');
  }, [admin, loading, router]);

  useEffect(() => {
    apiFetch<PricingConfig>('/admin/pricing')
      .then((c) => {
        setConfig(c);
        setPercentage((c.percentageBps / 100).toString());
        setFlatFee((Number(c.flatFeeCents) / 100).toString());
        setLabel(c.label);
      })
      .finally(() => setFetching(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiFetch<PricingConfig>('/admin/pricing', {
        method: 'PATCH',
        body: JSON.stringify({
          percentageBps: Math.round(Number(percentage) * 100),
          flatFeeCents: Math.round(Number(flatFee) * 100),
          label,
        }),
      });
      setConfig(updated);
      setMessage({ type: 'success', text: 'Tarification mise à jour ✓' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Échec de la mise à jour.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !admin) return null;

  const previewAmount = 10000; // 10 000 FCFA, pour l'exemple
  const previewOurFee = Math.round(previewAmount * (Number(percentage) / 100)) + Math.round(Number(flatFee));

  return (
    <AdminShell title="Tarification">
      <div className="adm-section" style={{ maxWidth: 560 }}>
        <p style={{ color: '#5a7a94', fontSize: 13.5, marginBottom: 20 }}>
          Ces frais s'appliquent à tous les services particulier (transfert, paiement, crédit/data, cartes cadeaux, factures).
          Les frais HUB2 eux-mêmes ne sont pas paramétrés ici — ils sont lus automatiquement à chaque transaction
          Mobile Money et s'ajoutent à ces frais internes.
        </p>

        {fetching ? (
          <p>Chargement...</p>
        ) : (
          <div className="adm-form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label>
              Libellé
              <input className="adm-input" style={{ width: '100%', marginTop: 6 }} value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              Frais en pourcentage (%)
              <input
                className="adm-input"
                style={{ width: '100%', marginTop: 6 }}
                type="number"
                step="0.01"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
              />
            </label>
            <label>
              Frais fixe par transaction (FCFA)
              <input
                className="adm-input"
                style={{ width: '100%', marginTop: 6 }}
                type="number"
                value={flatFee}
                onChange={(e) => setFlatFee(e.target.value)}
              />
            </label>

            <div style={{ background: '#f4f7f6', border: '1px solid #e2e8e5', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
              Exemple : pour une transaction de <strong>{fcfa(previewAmount * 100)} FCFA</strong>, les frais internes MobilePay
              seraient de <strong>{fcfa(previewOurFee * 100)} FCFA</strong> (hors frais HUB2, ajoutés séparément le cas échéant).
            </div>

            {message && (
              <div style={{ color: message.type === 'success' ? '#0a8f58' : '#c0442c', fontSize: 13.5, fontWeight: 600 }}>
                {message.text}
              </div>
            )}

            <button className="adm-btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>

            {config && (
              <p style={{ fontSize: 11.5, color: '#8a94a6', margin: 0 }}>
                Dernière modification : {new Date(config.updatedAt).toLocaleString('fr-FR')}
              </p>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
