'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Scanner QR par caméra (§ rôle réel de la page racine) — décode en direct
 * les images de la caméra, redirige automatiquement dès qu'un QR MobilePay
 * est détecté. Saisie manuelle en repli si la caméra est refusée/absente.
 */
export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = useState('');

  const navigateTo = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setScanning(false);
    if (/^https?:\/\//i.test(trimmed)) {
      // Le QR encode directement le lien complet (comportement normal de nos QR).
      window.location.href = trimmed;
    } else {
      // Saisie manuelle d'un simple code marchand (sans lien complet).
      window.location.href = `/q/${encodeURIComponent(trimmed)}`;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        setCameraError("Impossible d'accéder à la caméra — utilise la saisie manuelle ci-dessous.");
      }
    };

    const tick = () => {
      if (cancelled || !scanning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result?.data) {
            navigateTo(result.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mp-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 20, marginBottom: 6, textAlign: 'center' }}>📷 Scanner un QR MobilePay</h1>
      <p style={{ color: 'var(--mp-muted)', fontSize: 13.5, textAlign: 'center', marginBottom: 20, maxWidth: 320 }}>
        Vise le QR code du marchand ou du particulier — la redirection se fait automatiquement.
      </p>

      {!cameraError && (
        <div style={{ position: 'relative', width: '100%', maxWidth: 340, borderRadius: 20, overflow: 'hidden', background: '#000', aspectRatio: '1 / 1' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div
            style={{
              position: 'absolute',
              inset: '15%',
              border: '3px solid rgba(255,255,255,0.85)',
              borderRadius: 16,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.25)',
            }}
          />
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {cameraError && <div className="mp-error" style={{ marginTop: 4, marginBottom: 16, textAlign: 'center' }}>{cameraError}</div>}

      <div style={{ marginTop: 24, width: '100%', maxWidth: 340 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-muted)' }}>
          Ou saisis un code / colle un lien
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              className="mp-input"
              style={{ flex: 1 }}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Code ou lien de paiement"
              onKeyDown={(e) => e.key === 'Enter' && navigateTo(manualCode)}
            />
            <button className="mp-btn-primary" style={{ flexShrink: 0, padding: '0 16px' }} onClick={() => navigateTo(manualCode)}>
              Aller
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}
