'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/apiClient';

interface PersonalQr {
  code: string;
  url: string;
  imageDataUrl: string;
}

export default function RecevoirPage() {
  const [qr, setQr] = useState<PersonalQr | null>(null);

  useEffect(() => {
    apiFetch<PersonalQr>('/users/me/qr').then(setQr);
  }, []);

  return (
    <div className="mp-container">
      <div className="mp-header">
        <Link href="/dashboard" className="mp-link" style={{ color: 'white' }}>
          ← Retour
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: 20 }}>Recevoir de l'argent</h1>
      </div>
      <div className="mp-section" style={{ textAlign: 'center' }}>
        {qr ? (
          <>
            <img src={qr.imageDataUrl} alt="QR personnel" style={{ width: 220, height: 220 }} />
            <p style={{ fontSize: 13, color: '#6b7280', wordBreak: 'break-all', marginTop: 12 }}>
              {qr.url}
            </p>
            <p style={{ fontSize: 13, color: '#6b7280' }}>
              Partagez ce QR pour recevoir un paiement directement sur votre wallet.
            </p>
          </>
        ) : (
          <p>Génération du QR...</p>
        )}
      </div>
    </div>
  );
}
