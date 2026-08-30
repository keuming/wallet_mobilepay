'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import BusinessSideMenu from '../../components/BusinessSideMenu';
import QrResultCard from '../../components/QrResultCard';

type Tab = 'static' | 'dynamic' | 'link' | 'request' | 'card';

interface StaticQr {
  code: string;
  url: string;
  imageDataUrl: string;
}

interface PaymentLinkResult {
  slug: string;
  url: string;
  imageDataUrl: string;
}

// Next.js (App Router) exige que tout composant utilisant useSearchParams()
// soit enveloppé dans un <Suspense> pour l'export statique en production.
export default function EncaisserPage() {
  return (
    <Suspense fallback={null}>
      <EncaisserContent />
    </Suspense>
  );
}

function EncaisserContent() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) ?? 'static';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user || !activeMerchant) return null;

  return (
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <div style={{ display: 'flex', gap: 6 }}>
            <Link href="/dashboard" className="mp-icon-btn" title="Accueil">
              🏠
            </Link>
            <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
              ☰
            </button>
          </div>
          <span className="mp-brand-mark">
            <span className="dot" />
            Encaissement
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">
            ⏻
          </button>
        </div>
      </div>

      <BusinessSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-pill-tabs">
        <button className={`mp-pill-tab ${tab === 'static' ? 'active' : ''}`} onClick={() => setTab('static')}>
          📱 QR permanent
        </button>
        <button className={`mp-pill-tab ${tab === 'dynamic' ? 'active' : ''}`} onClick={() => setTab('dynamic')}>
          📱 QR dynamique
        </button>
        <button className={`mp-pill-tab ${tab === 'link' ? 'active' : ''}`} onClick={() => setTab('link')}>
          🔗 Lien (SMS/WhatsApp)
        </button>
        <button className={`mp-pill-tab ${tab === 'request' ? 'active' : ''}`} onClick={() => setTab('request')}>
          📲 Débit direct
        </button>
        <button className={`mp-pill-tab ${tab === 'card' ? 'active' : ''}`} onClick={() => setTab('card')}>
          💳 Carte
        </button>
      </div>

      {tab === 'static' && <StaticQrPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'dynamic' && <DynamicQrPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'link' && <PaymentLinkPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'request' && <PaymentRequestPanel merchantId={activeMerchant.merchantId} />}
      {tab === 'card' && <CardPanel />}
    </div>
  );
}

function CardPanel() {
  return (
    <div className="mp-form">
      <div
        style={{
          background: 'var(--mp-surface)',
          border: '1px solid var(--mp-border)',
          borderRadius: 16,
          padding: 20,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 700, color: 'var(--mp-navy)', marginBottom: 6 }}>
          Bientôt disponible
        </div>
        <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
          Le paiement par carte nécessite une connexion sécurisée directe avec HUB2 (aucune donnée
          de carte ne doit jamais transiter par cet appareil, par exigence de sécurité des réseaux
          Visa/Mastercard). Cette intégration est en cours de finalisation.
        </p>
      </div>
    </div>
  );
}

function StaticQrPanel({ merchantId }: { merchantId: string }) {
  const [qr, setQr] = useState<StaticQr | null>(null);

  useEffect(() => {
    apiFetch<StaticQr>(`/merchants/${merchantId}/qr/static`).then(setQr);
  }, [merchantId]);

  return (
    <div className="mp-form">
      <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
        Le client scanne ce QR fixe puis saisit lui-même le montant à payer.
      </p>
      {qr ? (
        <QrResultCard imageDataUrl={qr.imageDataUrl} url={qr.url} title="QR permanent" filename="mobilepay-qr-permanent" />
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
    <div className="mp-form">
      <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
        Montant fixe, QR temporaire à usage unique — expire après 15 minutes.
      </p>
      <input className="mp-input" placeholder="Montant (FCFA)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className="mp-input" placeholder="Description (ex: Course VTC)" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
      <button
        className="mp-btn-primary"
        style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }}
        disabled={submitting || !amount}
        onClick={generate}
      >
        {submitting ? 'Génération...' : 'Générer le QR'}
      </button>
      {result && (
        <QrResultCard imageDataUrl={result.imageDataUrl} url={result.url} title="QR dynamique" filename="mobilepay-qr-dynamique" />
      )}
    </div>
  );
}

function PaymentLinkPanel({ merchantId }: { merchantId: string }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState<PaymentLinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const generate = async () => {
    setSubmitting(true);
    setError(null);
    setLink(null);
    try {
      const result = await apiFetch<PaymentLinkResult>(`/merchants/${merchantId}/payment-links`, {
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
    <div className="mp-form">
      <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
        Lien partageable (WhatsApp, SMS...) — laissez le montant vide pour un montant libre saisi par
        le payeur.
      </p>
      <input className="mp-input" placeholder="Montant (FCFA) — optionnel" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className="mp-input" placeholder="Description — optionnel" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
      <button
        className="mp-btn-primary"
        style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }}
        disabled={submitting}
        onClick={generate}
      >
        {submitting ? 'Génération...' : 'Créer le lien'}
      </button>
      {link && (
        <QrResultCard imageDataUrl={link.imageDataUrl} url={link.url} title="Lien d'encaissement" filename="mobilepay-payment-link" />
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
    <div className="mp-form">
      <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
        Saisis le numéro et le montant à débiter — le client reçoit une notification et doit
        confirmer le paiement dans son app MobilePay (moyen de paiement : solde MobilePay).
      </p>
      <input className="mp-input" placeholder="Numéro du client (+225...)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
      <input className="mp-input" placeholder="Montant (FCFA)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className="mp-input" placeholder="Description — optionnel" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
      {success && <div style={{ color: 'var(--mp-green-dark)', fontSize: 13, fontWeight: 600 }}>Demande envoyée ✓</div>}
      <button
        className="mp-btn-primary"
        style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }}
        disabled={submitting || !customerPhone || !amount}
        onClick={send}
      >
        {submitting ? 'Envoi...' : 'Envoyer la demande'}
      </button>
    </div>
  );
}
