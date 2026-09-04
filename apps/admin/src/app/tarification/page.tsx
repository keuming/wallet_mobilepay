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
      <p style={{ color: 'var(--adm-muted)', fontSize: 13.5, marginBottom: 20, maxWidth: 560 }}>
        Ces frais s'appliquent à tous les services particulier (transfert, paiement, crédit/data, cartes cadeaux,
        factures). Les frais HUB2 eux-mêmes ne sont pas paramétrés ici — ils sont lus automatiquement à chaque
        transaction Mobile Money et s'ajoutent à ces frais internes.
      </p>

      {fetching ? (
        <p style={{ color: 'var(--adm-muted)' }}>Chargement...</p>
      ) : (
        <div className="adm-panel" style={{ maxWidth: 480 }}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label>
              <span className="adm-modal-label">Libellé</span>
              <input
                className="adm-input"
                style={{ width: '100%', marginTop: 6 }}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label>
              <span className="adm-modal-label">Frais en pourcentage (%)</span>
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
              <span className="adm-modal-label">Frais fixe par transaction (FCFA)</span>
              <input
                className="adm-input"
                style={{ width: '100%', marginTop: 6 }}
                type="number"
                value={flatFee}
                onChange={(e) => setFlatFee(e.target.value)}
              />
            </label>

            <div
              style={{
                background: 'rgba(10, 143, 88, 0.08)',
                border: '1px solid rgba(10, 143, 88, 0.25)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 13,
                color: 'var(--adm-text)',
                lineHeight: 1.5,
              }}
            >
              Exemple : pour une transaction de <strong>{fcfa(previewAmount * 100)} FCFA</strong>, les frais internes
              MobilePay seraient de <strong>{fcfa(previewOurFee * 100)} FCFA</strong> (hors frais HUB2, ajoutés
              séparément le cas échéant).
            </div>

            {message && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: message.type === 'success' ? 'var(--adm-accent)' : 'var(--adm-red)',
                }}
              >
                {message.text}
              </div>
            )}

            <button className="adm-btn" disabled={saving} onClick={save} style={{ padding: '10px 16px', fontSize: 13.5 }}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>

            {config && (
              <p style={{ fontSize: 11.5, color: 'var(--adm-muted)', margin: 0 }}>
                Dernière modification : {new Date(config.updatedAt).toLocaleString('fr-FR')}
              </p>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
