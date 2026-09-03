'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import StatusModal from '../../components/StatusModal';

interface FullProfile {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  kycLevel: string;
  createdAt: string;
}

const KYC_LABELS: Record<string, string> = {
  LEVEL_0: 'Non vérifié',
  LEVEL_1: 'Identité de base',
  LEVEL_2: 'Pièce d\'identité vérifiée',
  LEVEL_3: 'Vérification complète',
};

export default function ProfilPage() {
  const { user, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    apiFetch<FullProfile>('/users/me').then((p) => {
      setProfile(p);
      setFirstName(p.firstName);
      setLastName(p.lastName);
      setEmail(p.email ?? '');
    });
  }, [user, loading, router]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await apiFetch<FullProfile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ firstName, lastName, email: email || undefined }),
      });
      setProfile(updated);
      setEditing(false);
      setSuccess(true);
      await refreshProfile();
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || !profile) return null;

  const initials = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>👤 Mon profil</h1>
      </div>

      <div className="mp-section" style={{ textAlign: 'center', paddingBottom: 0 }}>
        <div className="mp-profile-avatar">{initials}</div>
        <div className="mp-kyc-badge">✓ {KYC_LABELS[profile.kycLevel] ?? profile.kycLevel}</div>
      </div>

      {!editing ? (
        <div className="mp-form">
          <div style={{ background: 'var(--fz-surface)', border: '1px solid var(--fz-border)', borderRadius: 16, overflow: 'hidden' }}>
            <div className="mp-detail-row" style={{ padding: '14px 16px' }}>
              <span className="k">Prénom</span>
              <span className="v">{profile.firstName}</span>
            </div>
            <div className="mp-detail-row" style={{ padding: '14px 16px', borderTop: '1px solid var(--fz-border)' }}>
              <span className="k">Nom</span>
              <span className="v">{profile.lastName}</span>
            </div>
            <div className="mp-detail-row" style={{ padding: '14px 16px', borderTop: '1px solid var(--fz-border)' }}>
              <span className="k">Téléphone</span>
              <span className="v">{profile.phone}</span>
            </div>
            <div className="mp-detail-row" style={{ padding: '14px 16px', borderTop: '1px solid var(--fz-border)' }}>
              <span className="k">Email</span>
              <span className="v">{profile.email ?? '—'}</span>
            </div>
          </div>
          {success && <div className="mp-success">Profil mis à jour ✓</div>}
          <button className="mp-btn-primary" onClick={() => setEditing(true)}>
            ✏️ Modifier mon profil
          </button>

          <div className="fz-option-group" style={{ marginTop: 8 }}>
            <Link href="/code-secret" className="fz-option-row">
              <span className="fz-option-left">
                <span className="fz-option-icon">🔒</span>
                <span className="fz-option-label">Code secret</span>
              </span>
              <span className="fz-option-chevron">→</span>
            </Link>
            <Link href="/deplafonnement" className="fz-option-row">
              <span className="fz-option-left">
                <span className="fz-option-icon">🪪</span>
                <span className="fz-option-label">Vérification d'identité</span>
              </span>
              <span className="fz-option-chevron">→</span>
            </Link>
            <Link href="/carte" className="fz-option-row">
              <span className="fz-option-left">
                <span className="fz-option-icon">💳</span>
                <span className="fz-option-label">Carte virtuelle</span>
              </span>
              <span className="fz-option-chevron">→</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="mp-form">
          <label>
            Prénom
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label>
            Nom
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optionnel"
            />
          </label>
          <p style={{ fontSize: 12, color: 'var(--fz-text-secondary)' }}>
            Le numéro de téléphone ne peut pas être modifié ici — il sert d'identifiant de connexion.
          </p>
          <button className="mp-btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button className="mp-btn-ghost" onClick={() => setEditing(false)}>
            Annuler
          </button>
        </div>
      )}

      {error && <StatusModal status="failed" message={error} onClose={() => setError(null)} />}
    </div>
  );
}
