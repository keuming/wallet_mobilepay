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
  profilePhotoBase64?: string | null;
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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

  /**
   * Redimensionne l'image côté client (300x300 max, JPEG compressé) avant
   * envoi — une photo de profil n'a jamais besoin d'être plus grande, et ça
   * évite d'approcher la limite serveur de 2 Mo pour un simple portrait.
   */
  const resizeImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const size = 300;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas indisponible.'));
          // Recadrage carré centré, quelle que soit la forme d'origine.
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error("Impossible de lire l'image."));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Échec de la lecture du fichier.'));
      reader.readAsDataURL(file);
    });

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de resélectionner le même fichier ensuite
    if (!file) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const resized = await resizeImage(file);
      const updated = await apiFetch<{ id: string; profilePhotoBase64: string }>('/users/me/photo', {
        method: 'PATCH',
        body: JSON.stringify({ photoBase64: resized }),
      });
      setProfile((p) => (p ? { ...p, profilePhotoBase64: updated.profilePhotoBase64 } : p));
      await refreshProfile();
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Échec de l'envoi de la photo.");
    } finally {
      setUploadingPhoto(false);
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
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {profile.profilePhotoBase64 ? (
            <img src={profile.profilePhotoBase64} alt="Photo de profil" className="mp-profile-avatar-photo" />
          ) : (
            <div className="mp-profile-avatar">{initials}</div>
          )}
          <label className="mp-profile-photo-edit" title="Changer la photo">
            {uploadingPhoto ? '...' : '📷'}
            <input type="file" accept="image/*" onChange={handlePhotoSelect} disabled={uploadingPhoto} style={{ display: 'none' }} />
          </label>
        </div>
        {photoError && <div className="mp-error" style={{ marginTop: 8 }}>{photoError}</div>}
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
            <Link href="/confidentialite" className="fz-option-row">
              <span className="fz-option-left">
                <span className="fz-option-icon">🔒</span>
                <span className="fz-option-label">Politique de confidentialité</span>
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
