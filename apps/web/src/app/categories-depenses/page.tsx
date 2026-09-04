'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';

interface Category {
  id: string;
  label: string;
  icon: string | null;
}

const SUGGESTED_ICONS = ['🏠', '🍽️', '🚗', '🛍️', '💊', '📚', '🎉', '👨‍👩‍👧', '💼', '📱'];

export default function CategoriesDepensesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('🏷️');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch<Category[]>('/expenses/categories').then(setCategories).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!label.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/expenses/categories', { method: 'POST', body: JSON.stringify({ label, icon }) });
      setLabel('');
      setIcon('🏷️');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/expenses/categories/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">← Retour</Link>
        <h1>🏷️ Types de charges</h1>
      </div>

      <div className="mp-form">
        <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: 0 }}>
          Crée tes propres catégories (Loyer, Nourriture, Transport...) pour suivre tes dépenses par type. Elles
          apparaîtront ensuite en choix rapide lors d'un transfert ou d'un paiement.
        </p>

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
            placeholder="Nom de la catégorie"
          />
        </div>
        {error && <div className="mp-error">{error}</div>}
        <button className="mp-btn-primary" disabled={submitting || !label.trim()} onClick={create}>
          {submitting ? 'Ajout...' : '+ Ajouter cette catégorie'}
        </button>

        <div style={{ marginTop: 12 }}>
          {loading && <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Chargement...</p>}
          {!loading && categories.length === 0 && (
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Aucune catégorie créée pour l'instant.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 12, border: '1px solid var(--fz-border)', background: 'var(--fz-surface)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-text-primary)' }}>
                  {c.icon} {c.label}
                </span>
                <button
                  onClick={() => remove(c.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--mp-red)', cursor: 'pointer', fontSize: 13 }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
