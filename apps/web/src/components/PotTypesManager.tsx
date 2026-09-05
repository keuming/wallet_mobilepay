'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../lib/apiClient';

interface PotType {
  id: string;
  label: string;
  icon: string | null;
  balance: string;
}

const SUGGESTED_ICONS = ['🏠', '🚗', '✈️', '🎓', '💍', '🏥', '📱', '🎉', '👨‍👩‍👧', '💼'];

/**
 * Gestion des types (§ Collecte ou Épargne — même logique) : créer/lister/
 * supprimer les pots personnalisés de l'utilisateur. Composant partagé pour
 * éviter de dupliquer ce code entre les deux fonctionnalités identiques.
 */
export default function PotTypesManager({
  kind,
  title,
  description,
  apiBase,
  actionHref,
}: {
  kind: 'collecte' | 'epargne';
  title: string;
  description: string;
  apiBase: string; // '/collecte/types' ou '/savings/types'
  actionHref: string; // '/collecte' ou '/epargne'
}) {
  const [types, setTypes] = useState<PotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(SUGGESTED_ICONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch<PotType[]>(apiBase).then(setTypes).finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!label.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(apiBase, { method: 'POST', body: JSON.stringify({ label, icon }) });
      setLabel('');
      setIcon(SUGGESTED_ICONS[0]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`${apiBase}/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">← Retour</Link>
        <h1>{title}</h1>
      </div>

      <div className="mp-form">
        <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: 0 }}>{description}</p>

        <div style={{ display: 'flex', gap: 8 }}>
          <select
            className="mp-input"
            style={{ width: 70, flexShrink: 0, textAlign: 'center' }}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          >
            {SUGGESTED_ICONS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <input
            className="mp-input"
            style={{ flex: 1 }}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'collecte' ? 'Nom de la collecte (ex: Voyage)' : "Nom de l'épargne (ex: Mariage)"}
          />
        </div>
        {error && <div className="mp-error">{error}</div>}
        <button className="mp-btn-primary" disabled={submitting || !label.trim()} onClick={create}>
          {submitting ? 'Ajout...' : '+ Créer'}
        </button>

        <div style={{ marginTop: 12 }}>
          {loading && <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Chargement...</p>}
          {!loading && types.length === 0 && (
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Aucune {kind === 'collecte' ? 'collecte' : 'épargne'} créée pour l'instant.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {types.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 12, border: '1px solid var(--fz-border)', background: 'var(--fz-surface)',
                }}
              >
                <Link href={`${actionHref}?type=${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1 }}>
                  <span style={{ fontSize: 22 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-text-primary)' }}>{t.label}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)' }}>{(Number(t.balance) / 100).toLocaleString('fr-FR')} FCFA</div>
                  </div>
                </Link>
                {Number(t.balance) === 0 && (
                  <button
                    onClick={() => remove(t.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--mp-red)', cursor: 'pointer', fontSize: 12.5 }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
