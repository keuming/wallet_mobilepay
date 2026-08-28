'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';

const DOCUMENT_TYPES = ['CNI', 'Passeport', 'Permis de conduire'];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface PhotoSlotProps {
  label: string;
  hint: string;
  value: string | null;
  onChange: (base64: string | null) => void;
  capture?: 'user' | 'environment';
}

function PhotoSlot({ label, hint, value, onChange, capture }: PhotoSlotProps) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-muted)', marginBottom: 6 }}>
        {label}
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: `1.5px dashed ${value ? 'var(--mp-green)' : 'var(--mp-border)'}`,
          borderRadius: 14,
          padding: 12,
          cursor: 'pointer',
          background: value ? 'rgba(10, 143, 88, 0.04)' : 'white',
        }}
      >
        {value ? (
          <img src={value} alt={label} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
              background: 'var(--mp-bg-from)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            📷
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mp-navy)' }}>
            {value ? 'Photo ajoutée ✓' : 'Ajouter une photo'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mp-muted)' }}>{hint}</div>
        </div>
        <input
          type="file"
          accept="image/*"
          capture={capture}
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) onChange(await fileToBase64(file));
          }}
        />
      </label>
    </div>
  );
}

export default function DeplafonnementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [documentRef, setDocumentRef] = useState('');
  const [recto, setRecto] = useState<string | null>(null);
  const [verso, setVerso] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!user) {
    router.replace('/login');
    return null;
  }

  const captureLocation = () => {
    setLocating(true);
    setError(null);
    if (!navigator.geolocation) {
      setError('La géolocalisation n\'est pas disponible sur cet appareil.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Impossible de récupérer votre position — vérifiez les autorisations.');
        setLocating(false);
      },
    );
  };

  const canSubmit = documentRef && recto && verso && selfie && location;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/kyc', {
        method: 'POST',
        body: JSON.stringify({
          documentType,
          documentRef,
          attachments: {
            rectoBase64: recto,
            versoBase64: verso,
            selfieBase64: selfie,
            latitude: location?.lat,
            longitude: location?.lng,
          },
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la demande.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/dashboard" className="mp-back-link">
            ← Retour
          </Link>
          <h1>📈 Déplafonnement</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ fontWeight: 700, color: 'var(--mp-navy)' }}>Dossier envoyé avec succès</p>
          <p style={{ color: 'var(--mp-muted)', fontSize: 13.5 }}>
            Un administrateur MobilePay va vérifier votre pièce d'identité, votre selfie et votre
            localisation. Vous serez notifié dès que votre compte sera déplafonné.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>📈 Déplafonner mon compte</h1>
      </div>

      <div className="mp-section" style={{ paddingBottom: 0 }}>
        <p style={{ color: 'var(--mp-muted)', fontSize: 13.5 }}>
          Conformément à la réglementation de la Banque Centrale, augmentez vos plafonds en fournissant
          une pièce d'identité nationale valide, un selfie et votre localisation.
        </p>
      </div>

      <div className="mp-form">
        <label>
          Type de pièce d'identité
          <select
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Numéro du document
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={documentRef}
            onChange={(e) => setDocumentRef(e.target.value)}
            placeholder="Ex: CI0123456789"
          />
        </label>

        <PhotoSlot
          label="Recto de la pièce d'identité"
          hint="Photo nette, tous les coins visibles"
          value={recto}
          onChange={setRecto}
          capture="environment"
        />
        <PhotoSlot
          label="Verso de la pièce d'identité"
          hint="Photo nette, tous les coins visibles"
          value={verso}
          onChange={setVerso}
          capture="environment"
        />
        <PhotoSlot
          label="Selfie"
          hint="Visage bien visible, sans lunettes de soleil"
          value={selfie}
          onChange={setSelfie}
          capture="user"
        />

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-muted)', marginBottom: 6 }}>
            Localisation
          </div>
          <button
            type="button"
            className="mp-btn-ghost"
            style={{ width: '100%' }}
            onClick={captureLocation}
            disabled={locating}
          >
            {location
              ? `📍 Position capturée (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`
              : locating
                ? 'Localisation...'
                : '📍 Capturer ma position actuelle'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--mp-muted)', marginTop: 4 }}>
            Carte interactive à venir dans une prochaine version.
          </p>
        </div>

        {error && <div className="mp-error">{error}</div>}
        <button className="mp-btn-primary" disabled={submitting || !canSubmit} onClick={handleSubmit}>
          {submitting ? 'Envoi...' : 'Envoyer ma demande'}
        </button>
      </div>
    </div>
  );
}
