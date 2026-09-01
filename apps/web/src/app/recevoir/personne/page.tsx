'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import StatusModal from '../../../components/StatusModal';

interface PersonalQr {
  code: string;
  url: string;
  imageDataUrl: string;
}

export default function EncaisserPage() {
  const router = useRouter();
  const [qr, setQr] = useState<PersonalQr | null>(null);
  const [amount, setAmount] = useState('');
  const [showRecap, setShowRecap] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [shareStatus, setShareStatus] = useState<'shared' | 'copied' | 'failed' | null>(null);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PersonalQr>('/users/me/qr').then(setQr);
  }, []);

  const requestLink = amount && qr ? `${qr.url}?montant=${Math.round(Number(amount) * 100)}` : qr?.url;

  const handleShare = async () => {
    if (!requestLink) return;
    const text = amount
      ? `Merci de m'envoyer ${Number(amount).toLocaleString('fr-FR')} FCFA via MobilePay : ${requestLink}`
      : `Envoyez-moi de l'argent via MobilePay : ${requestLink}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Demande de paiement MobilePay', text });
        setShareStatus('shared');
        return;
      } catch {
        // annulé ou échoué — repli sur la copie presse-papiers
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus('copied');
        return;
      } catch {
        setShareStatus('failed');
      }
    }
  };

  const handleSendSms = async () => {
    if (!requestLink || !smsPhone) return;
    setSmsSending(true);
    setSmsError(null);
    try {
      await apiFetch('/sms/send-link', {
        method: 'POST',
        body: JSON.stringify({
          toPhone: smsPhone,
          url: requestLink,
          label: amount ? `ta demande de ${Number(amount).toLocaleString('fr-FR')} FCFA` : 'mon lien de réception',
        }),
      });
      setSmsSent(true);
    } catch (err) {
      setSmsError(err instanceof ApiError ? err.message : "Échec de l'envoi du SMS.");
    } finally {
      setSmsSending(false);
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/recevoir" className="mp-back-link">
          ← Retour
        </Link>
        <h1>💰 Encaisser</h1>
      </div>

      {!showRecap ? (
        <div className="mp-form">
          <p style={{ fontSize: 13.5, color: 'var(--mp-muted)', margin: 0 }}>
            Indiquez un montant si vous souhaitez le préciser dans votre demande, ou laissez vide pour
            un montant libre.
          </p>
          <label>
            Montant demandé (FCFA) — optionnel
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Laisser vide pour un montant libre"
            />
          </label>
          <button className="mp-btn-primary" disabled={!qr} onClick={() => setShowRecap(true)}>
            Générer mon QR / lien
          </button>
        </div>
      ) : (
        <div className="mp-form">
          <div
            style={{
              background: 'var(--mp-surface)',
              border: '1.5px solid var(--mp-green)',
              borderRadius: 16,
              padding: '16px 18px',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mp-green-dark)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              🔍 Vérifiez avant de générer
            </div>
            <div className="mp-detail-row">
              <span className="k">Montant demandé</span>
              <span className="v">{amount ? `${Number(amount).toLocaleString('fr-FR')} FCFA` : 'Libre'}</span>
            </div>
            <div className="mp-detail-row">
              <span className="k">Compte bénéficiaire</span>
              <span className="v">{qr?.code}</span>
            </div>
          </div>
          <button
            className="mp-btn-primary"
            onClick={() => {
              setShowRecap(false);
              setShowSuccess(true);
            }}
          >
            ✅ Confirmer et générer
          </button>
          <button className="mp-btn-ghost" onClick={() => setShowRecap(false)}>
            ✏️ Modifier
          </button>
        </div>
      )}

      {!showRecap && qr && (
        <div className="mp-section" style={{ textAlign: 'center', paddingTop: 0 }}>
          <div
            style={{
              display: 'inline-block',
              padding: 18,
              borderRadius: 24,
              background: 'white',
              boxShadow: 'var(--mp-shadow-md)',
              border: '1px solid var(--mp-border)',
            }}
          >
            <img src={qr.imageDataUrl} alt="QR personnel" style={{ width: 220, height: 220, display: 'block' }} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--mp-muted)', wordBreak: 'break-all', marginTop: 16 }}>
            {requestLink}
          </p>
          <div style={{ marginTop: 18, textAlign: 'left' }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-muted)' }}>
              Envoyer ce lien par SMS
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  className="mp-input"
                  style={{ flex: 1 }}
                  value={smsPhone}
                  onChange={(e) => {
                    setSmsPhone(e.target.value);
                    setSmsSent(false);
                  }}
                  placeholder="+2250700000000"
                />
                <button
                  className="mp-btn-primary"
                  style={{ flexShrink: 0, padding: '0 16px' }}
                  disabled={smsSending || !smsPhone}
                  onClick={handleSendSms}
                >
                  {smsSending ? 'Envoi...' : smsSent ? 'Envoyé ✓' : 'Envoyer'}
                </button>
              </div>
            </label>
            {smsError && <div className="mp-error" style={{ marginTop: 6 }}>{smsError}</div>}
          </div>
        </div>
      )}

      {showSuccess && (
        <StatusModal
          status="success"
          title="Demande prête"
          message={
            amount
              ? `Votre demande de ${Number(amount).toLocaleString('fr-FR')} FCFA est prête à être partagée.`
              : 'Votre QR de réception est prêt à être partagé.'
          }
          onClose={() => setShowSuccess(false)}
          actions={
            <>
              <button className="mp-btn-primary" onClick={handleShare}>
                📤 Partager le lien
              </button>
              <button className="mp-btn-ghost" onClick={() => setShowSuccess(false)}>
                Fermer
              </button>
            </>
          }
        />
      )}

      {shareStatus && !showSuccess && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          {shareStatus === 'copied' && <div className="mp-success">Lien copié dans le presse-papiers ✓</div>}
          {shareStatus === 'shared' && <div className="mp-success">Lien partagé ✓</div>}
          {shareStatus === 'failed' && <div className="mp-error">Impossible de partager sur cet appareil.</div>}
        </div>
      )}
    </div>
  );
}
