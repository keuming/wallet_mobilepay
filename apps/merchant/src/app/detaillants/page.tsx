'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';
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

interface Retailer {
  id: string;
  businessName: string;
  category: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  balance: number;
  createdAt: string;
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

export default function DetaillantsPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [fetching, setFetching] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [country, setCountry] = useState('CI');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [actionRetailer, setActionRetailer] = useState<Retailer | null>(null);
  const [actionType, setActionType] = useState<'fund' | 'debit' | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => {
    if (!activeMerchant) return;
    setFetching(true);
    apiFetch<Retailer[]>(`/merchants/${activeMerchant.merchantId}/retailers`)
      .then(setRetailers)
      .finally(() => setFetching(false));
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

  if (loading || !user || !activeMerchant) return null;

  const createRetailer = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch(`/merchants/${activeMerchant.merchantId}/retailers`, {
        method: 'POST',
        body: JSON.stringify({
          businessName,
          category: category || undefined,
          ownerPhone: ownerPhone || undefined,
          ownerFirstName: ownerFirstName || undefined,
          ownerLastName: ownerLastName || undefined,
          ownerPin: ownerPin || undefined,
          country,
        }),
      });
      setBusinessName('');
      setCategory('');
      setOwnerPhone('');
      setOwnerFirstName('');
      setOwnerLastName('');
      setOwnerPin('');
      setShowCreate(false);
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Échec de la création.');
    } finally {
      setCreating(false);
    }
  };

  const submitAction = async () => {
    if (!actionRetailer || !actionType) return;
    setActionSubmitting(true);
    setActionError(null);
    try {
      await apiFetch(`/merchants/${activeMerchant.merchantId}/retailers/${actionRetailer.id}/${actionType}`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Math.round(Number(actionAmount) * 100) }),
      });
      setToast(actionType === 'fund' ? 'Approvisionnement réussi ! 🎉' : 'Débit réussi ! 🎉');
      setTimeout(() => setToast(null), 4000);
      setActionRetailer(null);
      setActionType(null);
      setActionAmount('');
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Échec de l'opération.");
    } finally {
      setActionSubmitting(false);
    }
  };

  const toggleStatus = async (retailer: Retailer) => {
    const newStatus = retailer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await apiFetch(`/merchants/${activeMerchant.merchantId}/retailers/${retailer.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  return (
    <MerchantShell title="Mes détaillants">
      {toast && (
        <div
          style={{
            background: 'rgba(18,179,116,.1)',
            border: '1px solid var(--mc-green)',
            color: 'var(--mc-green-dark, #0d7a4f)',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {toast}
        </div>
      )}
      <p style={{ color: 'var(--mc-muted)', fontSize: 13.5, margin: '0 0 16px', maxWidth: 600 }}>
        Créez et gérez vos comptes Business (détaillants) — chacun a son propre wallet et QR de
        réception. Basculez vers l'un d'eux via le sélecteur en haut du menu pour consulter son
        wallet, ses transactions et sa carte virtuelle.
      </p>

      <button className="mc-btn" style={{ marginBottom: 20 }} onClick={() => setShowCreate(true)}>
        + Créer un détaillant
      </button>

      <div className="mc-panel">
        {fetching ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)' }}>Chargement...</div>
        ) : retailers.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--mc-muted)' }}>Aucun détaillant pour le moment.</div>
        ) : (
          <table className="mc-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Catégorie</th>
                <th>Solde</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {retailers.map((r) => (
                <tr key={r.id}>
                  <td>{r.businessName}</td>
                  <td>{r.category ?? '—'}</td>
                  <td>{fcfa(r.balance)} FCFA</td>
                  <td>
                    <span className={`mc-badge ${r.status === 'ACTIVE' ? 'green' : r.status === 'SUSPENDED' ? 'red' : 'gray'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="mc-btn ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => {
                          setActionRetailer(r);
                          setActionType('fund');
                        }}
                      >
                        Approvisionner
                      </button>
                      <button
                        className="mc-btn ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => {
                          setActionRetailer(r);
                          setActionType('debit');
                        }}
                      >
                        Débiter
                      </button>
                      <button
                        className="mc-btn ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => toggleStatus(r)}
                      >
                        {r.status === 'SUSPENDED' ? 'Activer' : 'Bloquer'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,45,82,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--mc-navy)' }}>Créer un détaillant</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="mc-input" placeholder="Nom du détaillant *" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              <input className="mc-input" placeholder="Catégorie (optionnel)" value={category} onChange={(e) => setCategory(e.target.value)} />
              <label style={{ fontSize: 12, color: 'var(--mc-muted)' }}>
                Pays
                <select className="mc-input" style={{ marginTop: 4 }} value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </label>
              <p style={{ fontSize: 12, color: 'var(--mc-muted)', margin: '4px 0 0' }}>
                Accès de connexion (optionnel) — laisse vide si toi seul dois y accéder :
              </p>
              <input className="mc-input" placeholder="Numéro (+225...)" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              <input className="mc-input" placeholder="Prénom" value={ownerFirstName} onChange={(e) => setOwnerFirstName(e.target.value)} />
              <input className="mc-input" placeholder="Nom" value={ownerLastName} onChange={(e) => setOwnerLastName(e.target.value)} />
              <PasswordInput
                className="mc-input"
                placeholder="Code PIN (4 à 6 chiffres)"
                inputMode="numeric"
                maxLength={6}
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
              />
              {createError && <div className="mc-error">{createError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="mc-btn ghost" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Annuler</button>
                <button className="mc-btn" style={{ flex: 1 }} disabled={creating || !businessName} onClick={createRetailer}>
                  {creating ? 'Création...' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionRetailer && actionType && (
        <div
          onClick={() => setActionRetailer(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,45,82,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 360, width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--mc-navy)' }}>
              {actionType === 'fund' ? 'Approvisionner' : 'Débiter'} — {actionRetailer.businessName}
            </h3>
            <input
              className="mc-input"
              style={{ width: '100%', marginBottom: 10 }}
              type="number"
              placeholder="Montant (FCFA)"
              value={actionAmount}
              onChange={(e) => setActionAmount(e.target.value)}
            />
            {actionError && <div className="mc-error" style={{ marginBottom: 10 }}>{actionError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="mc-btn ghost" style={{ flex: 1 }} onClick={() => setActionRetailer(null)}>Annuler</button>
              <button className="mc-btn" style={{ flex: 1 }} disabled={actionSubmitting || !actionAmount} onClick={submitAction}>
                {actionSubmitting ? 'Envoi...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MerchantShell>
  );
}
