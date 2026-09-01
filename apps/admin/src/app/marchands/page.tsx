'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';
import PasswordInput from '../../components/PasswordInput';

const COUNTRIES = [
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'SN', label: 'Sénégal' },
  { code: 'ML', label: 'Mali' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'BJ', label: 'Bénin' },
  { code: 'TG', label: 'Togo' },
  { code: 'NE', label: 'Niger' },
  { code: 'GW', label: 'Guinée-Bissau' },
  { code: 'CM', label: 'Cameroun' },
  { code: 'GA', label: 'Gabon' },
  { code: 'CG', label: 'Congo' },
  { code: 'TD', label: 'Tchad' },
  { code: 'CF', label: 'République Centrafricaine' },
  { code: 'GQ', label: 'Guinée Équatoriale' },
];

interface Merchant {
  id: string;
  businessName: string;
  category: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  wallet: { cachedBalance: number } | null;
  createdAt: string;
}

const STATUS_BADGE: Record<Merchant['status'], { label: string; className: string }> = {
  ACTIVE: { label: 'Actif', className: 'green' },
  PENDING: { label: 'En attente', className: 'amber' },
  SUSPENDED: { label: 'Suspendu', className: 'red' },
  REJECTED: { label: 'Rejeté', className: 'gray' },
};

export default function MerchantsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fetching, setFetching] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('CI');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = (p = page, s = search) => {
    setFetching(true);
    apiFetch<{ merchants: Merchant[]; total: number }>(
      `/admin/merchants?page=${p}${s ? `&search=${encodeURIComponent(s)}` : ''}`,
    )
      .then((res) => {
        setMerchants(res.merchants);
        setTotal(res.total);
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, loading, router]);

  if (loading || !admin) return null;

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const submitCreate = async () => {
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const res = await apiFetch<{ merchant: Merchant; ownerCreated: boolean }>(
        '/admin/merchants',
        {
          method: 'POST',
          body: JSON.stringify({ businessName, category, ownerPhone, ownerFirstName, ownerLastName, ownerPin: ownerPin || undefined, country }),
        },
      );
      setCreateSuccess(res.ownerCreated ? 'Marchand créé, compte titulaire créé avec le PIN fourni ✓' : 'Marchand créé ✓');
      setBusinessName('');
      setCategory('');
      setOwnerPhone('');
      setOwnerFirstName('');
      setOwnerLastName('');
      setOwnerPin('');
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Échec de la création.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminShell title="Marchands">
      <div className="adm-search-bar">
        <input
          className="adm-input"
          style={{ flex: 1 }}
          placeholder="Rechercher un marchand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              load(1, search);
            }
          }}
        />
        <button
          className="adm-btn ghost"
          onClick={() => {
            setPage(1);
            load(1, search);
          }}
        >
          Rechercher
        </button>
        <button className="adm-btn" onClick={() => setShowCreate(true)}>
          + Ajouter
        </button>
      </div>

      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Établissement</th>
              <th>Catégorie</th>
              <th>Statut</th>
              <th>Solde wallet</th>
              <th>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={5} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : merchants.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: '#8a97b3', textAlign: 'center', padding: 24 }}>
                  Aucun marchand trouvé.
                </td>
              </tr>
            ) : (
              merchants.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/marchands/${m.id}`} style={{ color: '#e6ecf5', textDecoration: 'none' }}>
                      {m.businessName}
                    </Link>
                  </td>
                  <td>{m.category ?? '—'}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[m.status].className}`}>
                      {STATUS_BADGE[m.status].label}
                    </span>
                  </td>
                  <td>{m.wallet ? `${(m.wallet.cachedBalance / 100).toLocaleString('fr-FR')} FCFA` : '—'}</td>
                  <td>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="adm-pagination">
          <button
            className="adm-btn ghost"
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(p, search);
            }}
          >
            ← Précédent
          </button>
          <span style={{ color: '#8a97b3', fontSize: 13, alignSelf: 'center' }}>
            Page {page} / {totalPages}
          </span>
          <button
            className="adm-btn ghost"
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(p, search);
            }}
          >
            Suivant →
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="adm-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-title">+ Ajouter un marchand</div>
            <div className="adm-modal-form">
              <label className="adm-modal-label">
                Nom commercial
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Catégorie
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Restauration" />
              </label>
              <label className="adm-modal-label">
                Pays
                <select className="adm-input" style={{ width: '100%', marginTop: 4 }} value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="adm-modal-label">
                Téléphone du titulaire
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="+2250700000000" />
              </label>
              <label className="adm-modal-label">
                Prénom du titulaire
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={ownerFirstName} onChange={(e) => setOwnerFirstName(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Nom du titulaire
                <input className="adm-input" style={{ width: '100%', marginTop: 4 }} value={ownerLastName} onChange={(e) => setOwnerLastName(e.target.value)} />
              </label>
              <label className="adm-modal-label">
                Code PIN du titulaire <span style={{ fontWeight: 400 }}>(si nouveau compte)</span>
                <PasswordInput
                  className="adm-input"
                  style={{ marginTop: 4 }}
                  inputMode="numeric"
                  maxLength={6}
                  value={ownerPin}
                  onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 à 6 chiffres"
                />
              </label>
              <p style={{ fontSize: 11, color: 'var(--adm-muted)' }}>
                Si ce numéro n'a pas encore de compte MobilePay, un compte lui sera créé
                automatiquement avec le code PIN saisi ci-dessus. Si le numéro a déjà un compte, ce
                champ est ignoré.
              </p>
              {createError && <div className="adm-error">{createError}</div>}
              {createSuccess && <div className="adm-success" style={{ color: 'var(--adm-accent-light)', fontSize: 13 }}>{createSuccess}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="adm-btn ghost" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>
                  {createSuccess ? 'Fermer' : 'Annuler'}
                </button>
                {!createSuccess && (
                  <button
                    className="adm-btn"
                    style={{ flex: 1 }}
                    disabled={creating || !businessName || !category || !ownerPhone || !ownerFirstName || !ownerLastName}
                    onClick={submitCreate}
                  >
                    {creating ? 'Création...' : 'Créer'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
