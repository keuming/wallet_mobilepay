'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';

export default function AgentPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'scan' | 'form' | 'success'>('scan');
  const [qrCode, setQrCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [scannerError, setScannerError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (step !== 'scan') return;
    const scanner = new Html5Qrcode('agent-qr-reader');
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setQrCode(decodedText);
          setStep('form');
          scanner.stop().catch(() => {});
        },
        () => {},
      )
      .catch(() => setScannerError("Impossible d'acceder a la camera. Utilise la saisie manuelle ci-dessous."));

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [step]);

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    setQrCode(manualCode.trim().toUpperCase());
    setStep('form');
  };

  const handleLink = async () => {
    if (!businessName.trim() || !ownerPhone.trim() || ownerPin.length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ merchant: { businessName: string }; alreadyLinked?: boolean }>(
        '/agents/link-merchant',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKeyRef.current },
          body: JSON.stringify({
            qrCode,
            businessName: businessName.trim(),
            ownerPhone: ownerPhone.trim(),
            ownerPin,
          }),
        },
      );
      setResultMessage(
        res.alreadyLinked
          ? `Cette carte etait deja liee a ${res.merchant.businessName}.`
          : `${res.merchant.businessName} est maintenant actif sur ORZAYAH !`,
      );
      setStep('success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "La liaison n'a pas pu aboutir.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNext = () => {
    setStep('scan');
    setQrCode('');
    setManualCode('');
    setBusinessName('');
    setOwnerPhone('');
    setOwnerPin('');
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  };

  if (loading || !user) return null;
  return (
    <div style={{ minHeight: '100vh', background: '#0B0F1A', color: '#fff', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Agent ORZAYAH</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{user.firstName} {user.lastName}</div>
        </div>
        <button onClick={() => logout()} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
          Deconnexion
        </button>
      </div>

      {step === 'scan' && (
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Scanne la carte du marchand</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
            Positionne le QR code de la carte devant la camera.
          </p>
          <div id="agent-qr-reader" style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16 }} />
          {scannerError && (
            <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{scannerError}</p>
          )}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16, marginTop: 8 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>
              Ou saisis le code manuellement
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="ORZ-XXXXXXXX"
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
              />
              <button onClick={handleManualSubmit} style={{ background: '#00D27A', color: '#000', border: 'none', borderRadius: 10, padding: '0 20px', fontWeight: 700 }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Infos du marchand</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
            Carte : <strong>{qrCode}</strong>
          </p>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Nom du commerce</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex: Maquis Chez Fatou" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Numero de telephone du marchand</label>
              <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="07XXXXXXXX" inputMode="tel" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Code secret (4 a 6 chiffres)</label>
              <input value={ownerPin} onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))} placeholder="****" inputMode="numeric" maxLength={6} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', letterSpacing: 4 }} />
            </div>
          </div>

          <button
            onClick={handleLink}
            disabled={submitting || !businessName.trim() || !ownerPhone.trim() || ownerPin.length < 4}
            style={{ width: '100%', marginTop: 20, background: '#00D27A', color: '#000', border: 'none', borderRadius: 12, padding: 16, fontWeight: 700, fontSize: 15, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Liaison en cours...' : 'Activer ce marchand'}
          </button>
          <button onClick={() => setStep('scan')} style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', padding: 10, fontSize: 13 }}>
            Annuler et re-scanner
          </button>
        </div>
      )}

      {step === 'success' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Marchand active !</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 32 }}>{resultMessage}</p>
          <button onClick={resetForNext} style={{ background: '#00D27A', color: '#000', border: 'none', borderRadius: 12, padding: '14px 28px', fontWeight: 700 }}>
            Lier une autre carte
          </button>
        </div>
      )}
    </div>
  );
}
