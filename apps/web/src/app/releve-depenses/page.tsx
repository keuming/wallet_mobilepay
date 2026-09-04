'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/apiClient';

interface Category {
  id: string;
  label: string;
  icon: string | null;
}

interface ExpenseItem {
  id: string;
  type: string;
  description: string | null;
  amount: string;
  feeAmount: string;
  createdAt: string;
  category: Category | null;
}

interface Statement {
  items: ExpenseItem[];
  totalAmount: string;
  count: number;
}

const TYPE_LABELS: Record<string, string> = {
  TRANSFER: 'Transfert',
  WITHDRAWAL: 'Envoi externe',
  PAYMENT: 'Paiement',
  AIRTIME: 'Crédit/Data',
  GIFT_CARD: 'Carte cadeau',
  UTILITY_PAYMENT: 'Facture',
};

const PERIOD_PRESETS = [
  { id: 'month', label: 'Ce mois-ci' },
  { id: 'last7', label: '7 derniers jours' },
  { id: 'last30', label: '30 derniers jours' },
  { id: 'custom', label: 'Période personnalisée' },
];

function fcfa(centsStr: string): string {
  return (Number(centsStr) / 100).toLocaleString('fr-FR');
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ReleveDepensesPage() {
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Category[]>('/expenses/categories').then(setCategories);
  }, []);

  useEffect(() => {
    const now = new Date();
    if (preset === 'month') {
      setFrom(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(toDateInput(now));
    } else if (preset === 'last7') {
      setFrom(toDateInput(new Date(now.getTime() - 7 * 86400000)));
      setTo(toDateInput(now));
    } else if (preset === 'last30') {
      setFrom(toDateInput(new Date(now.getTime() - 30 * 86400000)));
      setTo(toDateInput(now));
    }
  }, [preset]);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (categoryId) params.set('categoryId', categoryId);
    apiFetch<Statement>(`/expenses/statement?${params.toString()}`)
      .then(setStatement)
      .finally(() => setLoading(false));
  }, [from, to, categoryId]);

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">← Retour</Link>
        <h1>📊 Relevé de dépenses</h1>
      </div>

      <div className="mp-form">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`fz-tab ${preset === p.id ? 'active' : ''}`}
              style={{ flex: '1 1 auto', minWidth: 100 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>
              Du
              <input className="mp-input" style={{ width: '100%', marginTop: 6 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Au
              <input className="mp-input" style={{ width: '100%', marginTop: 6 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        {categories.length > 0 && (
          <label>
            Catégorie
            <select className="mp-input" style={{ width: '100%', marginTop: 6 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>
          </label>
        )}

        <div className="fz-balance-card" style={{ margin: '8px 0' }}>
          <div className="fz-balance-top">
            <div>
              <span className="fz-balance-label">💸 Total dépensé sur la période</span>
              <span className="fz-balance-amount">
                {statement ? fcfa(statement.totalAmount) : '—'}
                <span className="fz-currency">FCFA</span>
              </span>
            </div>
          </div>
        </div>

        {loading && <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Chargement...</p>}
        {!loading && statement && statement.items.length === 0 && (
          <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5 }}>Aucune dépense sur cette période.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statement?.items.map((item) => (
            <div key={item.id} className="fz-tx-card" style={{ cursor: 'default' }}>
              <div className="fz-tx-left">
                <div className="fz-tx-icon debit">
                  {item.category?.icon ?? '💸'}
                </div>
                <div>
                  <div className="fz-tx-name">{item.description ?? TYPE_LABELS[item.type] ?? item.type}</div>
                  <div className="fz-tx-sub">
                    {item.category?.label ?? TYPE_LABELS[item.type] ?? item.type} · {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              </div>
              <div className="fz-tx-amount debit">
                − {fcfa((BigInt(item.amount) + BigInt(item.feeAmount)).toString())} FCFA
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
