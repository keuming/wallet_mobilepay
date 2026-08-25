'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import MerchantShell from '../../components/MerchantShell';

type Tab = 'static' | 'dynamic' | 'link' | 'request';

interface StaticQr {
  code: string;
  url: string;
  imageDataUrl: string;
}

export default function EncaisserPage() {
  const { user, loading, activeMerchant } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) ?? 'static';
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user || !activeMerchant) return null;

  return (
    <MerchantShell title="Encaissement">
      <div className="mc-tabs">
        <div className={`mc-tab ${tab === 'static' ? 'active' : ''}`} onClick={() => setTab('static')}>
          QR permanent
        </div>
        <div className={`mc-tab ${tab === 'dynamic' ? 'active' : ''}`} onClick={() => setTab('dynamic')}>
          QR dynamique
        </div>
        <div className={`mc-tab ${tab === 'link' ? 'active' : ''}`} onClick={() => setTab('link')}>
          Payment Link
        </div>
        <div className={`mc-tab ${tab === 'request' ? 'active' : ''}`} onClick={() => setTab('request')}>
          Demande de paiement
        </div>
      </div>

      {tab === 'static' && <StaticQrPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'dynamic' && <DynamicQrPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'link' && <PaymentLinkPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'request' && <PaymentRequestPanel merchantId={activeMerchant.merchantId} />}
    </MerchantShell>
  );
}

function StaticQrPanel({ merchantId }: { merchantId: string }) {
  const [qr, setQr] = useState<StaticQr | null>(null);

  useEffect(() => {
    apiFetch<StaticQr>(`/merchants/${merchantId}/qr/static`).then(setQr);
  }, [merchantId]);

  return (
    <div className="mc-panel" style={{ padding: 24, textAlign: 'center' }}>
      <p style={{ color: '#5a7a94', fontSize: 13, marginBottom: 16 }}>
        Le client scanne ce QR fixe puis saisit lui-même le montant à payer (§12 option 1).
      </p>
      {qr ? (
        <>
          <img src={qr.imageDataUrl} alt="QR marchand" style={{ width: 220, height: 220 }} />
          <p style={{ fontSize: 12, color: '#5a7a94', wordBreak: 'break-all', marginTop: 12 }}>{qr.url}</p>
        </>
      ) : (
        <p>Chargement...</p>
      )}
    </div>
  );
}

function DynamicQrPanel({ merchantId }: { merchantId: string }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<StaticQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const generate = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const qr = await apiFetch<StaticQr>(`/merchants/${merchantId}/qr/dynamic`, {
        method: 'POST',
        body: JSON.stringify({ amount: Math.round(Number(amount) * 100), description: description || undefined }),
      });
      setResult(qr);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la génération.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mc-panel" style={{ padding: 24 }}>
      <p style={{ color: '#5a7a94', fontSize: 13, marginBottom: 16 }}>
        Montant fixe, QR temporaire à usage unique (§12 option 2 — expire après 15 minutes).
      </p>
      <div className="mc-form" style={{ padding: 0 }}>
        <input
          className="mc-input"
          placeholder="Montant (FCFA)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="mc-input"
          placeholder="Description (ex: Course VTC)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <div className="mc-error">{error}</div>}
        <button className="mc-btn" disabled={submitting || !amount} onClick={generate}>
          {submitting ? 'Génération...' : 'Générer le QR'}
        </button>
      </div>
      {result && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <img src={result.imageDataUrl} alt="QR dynamique" style={{ width: 200, height: 200 }} />
          <p style={{ fontSize: 12, color: '#5a7a94', wordBreak: 'break-all', marginTop: 12 }}>{result.url}</p>
        </div>
      )}
    </div>
  );
}

function PaymentLinkPanel({ merchantId }: { merchantId: string }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const generate = async () => {
    setSubmitting(true);
    setError(null);
    setLink(null);
    try {
      const result = await apiFetch<{ url: string }>(`/merchants/${merchantId}/payment-links`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amount ? Math.round(Number(amount) * 100) : undefined,
          description: description || undefined,
        }),
      });
      setLink(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la génération.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mc-panel" style={{ padding: 24 }}>
      <p style={{ color: '#5a7a94', fontSize: 13, marginBottom: 16 }}>
        Lien partageable (WhatsApp, SMS...) — laissez le montant vide pour un montant libre saisi par le
        payeur (§12 option 3).
      </p>
      <div className="mc-form" style={{ padding: 0 }}>
        <input
          className="mc-input"
          placeholder="Montant (FCFA) — optionnel"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="mc-input"
          placeholder="Description — optionnel"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <div className="mc-error">{error}</div>}
        <button className="mc-btn" disabled={submitting} onClick={generate}>
          {submitting ? 'Génération...' : 'Créer le lien'}
        </button>
      </div>
      {link && (
        <div style={{ marginTop: 16, padding: 12, background: '#f4f7f6', borderRadius: 8 }}>
          <code style={{ fontSize: 13, wordBreak: 'break-all' }}>{link.url}</code>
        </div>
      )}
    </div>
  );
}

function PaymentRequestPanel({ merchantId }: { merchantId: string }) {
  const [customerPhone, setCustomerPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch(`/merchants/${merchantId}/payment-requests`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          customerPhone,
          amount: Math.round(Number(amount) * 100),
          description: description || undefined,
        }),
      });
      setSuccess(true);
      setCustomerPhone('');
      setAmount('');
      setDescription('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de l\'envoi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mc-panel" style={{ padding: 24 }}>
      <p style={{ color: '#5a7a94', fontSize: 13, marginBottom: 16 }}>
        Le client reçoit une notification et doit confirmer le paiement dans son app (§12 option 4).
      </p>
      <div className="mc-form" style={{ padding: 0 }}>
        <input
          className="mc-input"
          placeholder="Numéro du client (+225...)"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
        />
        <input
          className="mc-input"
          placeholder="Montant (FCFA)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="mc-input"
          placeholder="Description — optionnel"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <div className="mc-error">{error}</div>}
        {success && <div className="mc-success">Demande envoyée ✓</div>}
        <button className="mc-btn" disabled={submitting || !customerPhone || !amount} onClick={send}>
          {submitting ? 'Envoi...' : 'Envoyer la demande'}
        </button>
      </div>
    </div>
  );
}
