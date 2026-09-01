'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';

interface StaticQr {
  code: string;
  url: string;
  imageDataUrl: string;
}

export default function QrPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const [qr, setQr] = useState<StaticQr | null>(null);
  const [fetching, setFetching] = useState(true);
  const [copied, setCopied] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!activeMerchant) {
      setFetching(false);
      return;
    }
    apiFetch<StaticQr>(`/merchants/${activeMerchant.merchantId}/qr/static`)
      .then(setQr)
      .finally(() => setFetching(false));
  }, [user, loading, activeMerchant, router]);

  if (loading || !user) return null;

  const handleCopy = async () => {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr.imageDataUrl;
    a.download = `qr-${activeMerchant?.businessName ?? 'marchand'}.png`;
    a.click();
  };

  const handleSendSms = async () => {
    if (!qr || !smsPhone) return;
    setSmsSending(true);
    setSmsError(null);
    try {
      await apiFetch('/sms/send-link', {
        method: 'POST',
        body: JSON.stringify({ toPhone: smsPhone, url: qr.url, label: `le lien de paiement de ${activeMerchant?.businessName}` }),
      });
      setSmsSent(true);
    } catch (err) {
      setSmsError(err instanceof ApiError ? err.message : "Échec de l'envoi du SMS.");
    } finally {
      setSmsSending(false);
    }
  };

  return (
    <MerchantShell title="QR Code">
      <p style={{ color: 'var(--mc-muted)', fontSize: 13.5, margin: '0 0 20px', maxWidth: 560 }}>
        Ton QR permanent — à imprimer et afficher en boutique. Un client peut le scanner pour te
        payer directement, avec ou sans compte MobilePay.
      </p>

      {fetching ? (
        <p style={{ color: 'var(--mc-muted)' }}>Chargement...</p>
      ) : !qr ? (
        <p style={{ color: 'var(--mc-muted)' }}>Aucun QR trouvé pour cet établissement.</p>
      ) : (
        <div className="mc-panel" style={{ maxWidth: 380 }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <img
              src={qr.imageDataUrl}
              alt="QR code marchand"
              style={{ width: 240, height: 240, margin: '0 auto 18px', display: 'block', borderRadius: 12, border: '1px solid var(--mc-border)' }}
            />
            <div
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: 'var(--mc-muted)',
                wordBreak: 'break-all',
                marginBottom: 16,
                background: '#f4f7f6',
                padding: 10,
                borderRadius: 8,
              }}
            >
              {qr.url}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="mc-btn ghost" style={{ flex: 1 }} onClick={handleCopy}>
                {copied ? 'Copié ✓' : '📋 Copier le lien'}
              </button>
              <button className="mc-btn" style={{ flex: 1 }} onClick={handleDownload}>
                ⬇️ Télécharger
              </button>
            </div>
            <div style={{ marginTop: 16, textAlign: 'left' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--mc-muted)' }}>
                Envoyer ce lien par SMS
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input
                    className="mc-input"
                    style={{ flex: 1 }}
                    value={smsPhone}
                    onChange={(e) => {
                      setSmsPhone(e.target.value);
                      setSmsSent(false);
                    }}
                    placeholder="+2250700000000"
                  />
                  <button className="mc-btn" style={{ flexShrink: 0 }} disabled={smsSending || !smsPhone} onClick={handleSendSms}>
                    {smsSending ? 'Envoi...' : smsSent ? 'Envoyé ✓' : 'Envoyer'}
                  </button>
                </div>
              </label>
              {smsError && <div className="mc-error" style={{ marginTop: 6 }}>{smsError}</div>}
            </div>
          </div>
        </div>
      )}
    </MerchantShell>
  );
}
