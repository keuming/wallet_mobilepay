'use client';

import { useState } from 'react';

interface QrResultCardProps {
  imageDataUrl: string;
  url: string;
  title?: string;
  filename?: string;
}

/**
 * Carte de résultat QR réutilisée pour les 3 modes d'encaissement (QR
 * permanent, QR dynamique, Payment Link) — image QR, copie du lien,
 * partage natif (WhatsApp/SMS...) et téléchargement de l'image.
 */
export default function QrResultCard({ imageDataUrl, url, title = 'Votre QR', filename = 'mobilepay-qr' }: QrResultCardProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'shared' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('failed');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Payez via MobilePay : ${url}`, url });
        setCopyStatus('shared');
      } else {
        await navigator.clipboard.writeText(url);
        setCopyStatus('copied');
      }
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      // L'utilisateur a annulé le partage — pas une erreur à afficher.
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageDataUrl;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--mp-border)',
        borderRadius: 'var(--mp-radius)',
        padding: '22px 20px',
        textAlign: 'center',
        boxShadow: 'var(--mp-shadow-md)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mp-navy)', marginBottom: 14 }}>{title}</div>

      <div
        style={{
          display: 'inline-block',
          padding: 14,
          background: 'white',
          borderRadius: 16,
          border: '1px solid var(--mp-border)',
        }}
      >
        <img src={imageDataUrl} alt="QR code" style={{ width: 200, height: 200, display: 'block' }} />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: '10px 14px',
          background: 'var(--mp-surface)',
          borderRadius: 12,
          fontSize: 12,
          color: 'var(--mp-muted)',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
        }}
      >
        {url}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleCopy}
          className="mp-btn-primary"
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--mp-border)', color: 'var(--mp-text)', boxShadow: 'none', padding: '11px 6px', fontSize: 12.5 }}
        >
          📋 Copier
        </button>
        <button
          onClick={handleShare}
          className="mp-btn-primary"
          style={{ flex: 1, background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)', padding: '11px 6px', fontSize: 12.5 }}
        >
          📤 Partager
        </button>
        <button
          onClick={handleDownload}
          className="mp-btn-primary"
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--mp-border)', color: 'var(--mp-text)', boxShadow: 'none', padding: '11px 6px', fontSize: 12.5 }}
        >
          ⬇️ Télécharger
        </button>
      </div>

      {copyStatus === 'copied' && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--mp-green-dark)', fontWeight: 600 }}>Lien copié ✓</div>
      )}
      {copyStatus === 'shared' && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--mp-green-dark)', fontWeight: 600 }}>Partagé ✓</div>
      )}
      {copyStatus === 'failed' && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--mp-red)' }}>Impossible de copier sur cet appareil.</div>
      )}
    </div>
  );
}
