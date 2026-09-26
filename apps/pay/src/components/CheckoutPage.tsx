'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/apiClient';

/* § Réseau de la carte déduit du numéro saisi (préfixes officiels) :
   Visa 4… ; Mastercard 51-55… ou 2221-2720… */
function reseauCarte(numero: string): 'visa' | 'mastercard' | null {
  const n = numero.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n)) return 'mastercard';
  const p4 = parseInt(n.slice(0, 4), 10);
  if (n.length >= 4 && p4 >= 2221 && p4 <= 2720) return 'mastercard';
  return null;
}
/* § Contrôle de Luhn : détecte une faute de frappe avant l'envoi. */
function numeroCarteValide(numero: string): boolean {
  const n = numero.replace(/\D/g, '');
  if (n.length < 13 || n.length > 19) return false;
  let somme = 0;
  for (let i = 0; i < n.length; i++) {
    let c = parseInt(n[n.length - 1 - i], 10);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    somme += c;
  }
  return somme % 10 === 0;
}
const LIBELLE_RESEAU = { visa: 'Carte Visa', mastercard: 'Carte Mastercard' } as const;

const MOMO_PROVIDERS = [
  { id: 'orange', label: 'Orange Money', dialCode: '225' },
  { id: 'mtn', label: 'MTN MoMo', dialCode: '225' },
  { id: 'moov', label: 'Moov Money', dialCode: '225' },
  { id: 'wave', label: 'Wave', dialCode: '225' },
];

interface ResolvedTarget {
  businessName?: string;
  merchant?: {
    businessName: string;
    users?: { user: { phone: string } }[];
  };
  ownerUser?: { firstName: string; lastName: string; phone?: string };
  amount?: number | null;
  fixedAmount?: number | null;
  description?: string | null;
}

interface PaymentResponse {
  id: string;
  reference?: string;
  status: string;
  amount?: number;
  feeAmount?: number;
  description?: string | null;
  providerName?: string | null;
  createdAt?: string;
  nextActionType?: string | null;
  nextActionMessage?: string | null;
  nextActionUrl?: string | null;
  failureReason?: string | null;
}

const CONFETTI_COLORS = ['#00D27A', '#00D27A', '#0d9488', '#FFD166', '#00D27A', '#2dd4bf'];
const CONFETTI_PIECES = Array.from({ length: 16 }, (_, i) => {
  const angleDeg = (360 / 16) * i + (i % 2 === 0 ? 6 : -6);
  const distance = 70 + ((i * 37) % 40);
  const rad = (angleDeg * Math.PI) / 180;
  return {
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    tx: Math.cos(rad) * distance,
    ty: Math.sin(rad) * distance - 20,
    delay: (i % 4) * 40,
    size: i % 3 === 0 ? 9 : 6,
    shape: i % 2 === 0 ? '50%' : '2px',
  };
});

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

/**
 * Page de paiement publique (§ pay.orzayah.com) — accessible sans compte
 * ORZAYAH. Le client choisit soit de payer avec son solde ORZAYAH (s'il
 * en a un, redirection vers le wallet), soit avec un autre Mobile Money
 * (Orange/MTN/Moov/Wave), directement sur cette page sans connexion.
 *
 * § Corrigé : le parcours PAY-IN suit désormais réellement la confirmation
 * jusqu'au bout (sondage du statut, saisie du code OTP si l'opérateur
 * l'exige, message final clair) au lieu de rester sur un message statique
 * sans savoir si le paiement a vraiment abouti.
 */
export default function CheckoutPage({
  resolveEndpoint,
  payExternalEndpoint,
  walletAppUrl,
  walletAppQueryKey,
  walletAppPath = 'payer',
  mobilePaySubtitle = "J'ai déjà un compte ORZAYAH",
  identifier,
}: {
  resolveEndpoint: string;
  payExternalEndpoint: string;
  walletAppUrl: string;
  walletAppQueryKey: string;
  walletAppPath?: string;
  mobilePaySubtitle?: string;
  identifier: string;
}) {
  const [target, setTarget] = useState<ResolvedTarget | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<'choice' | 'external' | 'card'>('choice');

  const [localNumber, setLocalNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: 'pending' | 'otp' | 'success' | 'failed'; message: string } | null>(null);
  const [receipt, setReceipt] = useState<PaymentResponse | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch<ResolvedTarget>(resolveEndpoint)
      .then(setTarget)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Introuvable.'));
  }, [resolveEndpoint]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (result?.status !== 'success') return;
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 1100);
    return () => clearTimeout(timer);
  }, [result?.status]);

  const businessName =
    target?.merchant?.businessName ??
    target?.businessName ??
    (target?.ownerUser ? `${target.ownerUser.firstName} ${target.ownerUser.lastName}` : undefined);

  // § Le numéro du bénéficiaire est affiché À CÔTÉ du nom : sans lui, le
  // payeur n'a aucun moyen de vérifier qu'il envoie bien son argent à la
  // bonne personne. C'est l'information qui rassure — ou qui alerte.
  const beneficiaryPhone =
    target?.ownerUser?.phone ?? target?.merchant?.users?.[0]?.user?.phone ?? undefined;

  /** Masque partiellement le numéro : identifiable sans être exposé publiquement. */
  const maskPhone = (phone: string) =>
    phone.replace(/^(\+\d{3}\d{2})\d+(\d{2})$/, '$1••••$2');
  const fixedAmount = target?.fixedAmount ?? target?.amount ?? null;
  const dialCode = MOMO_PROVIDERS.find((p) => p.id === provider)?.dialCode ?? '225';

  const downloadReceipt = async () => {
    if (!receipt) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    const green = '#00D27A';
    const dark = '#16211C';
    const gray = '#5a7a72';

    doc.setFillColor(green);
    doc.rect(0, 0, 148, 22, 'F');
    doc.setTextColor('#FFFFFF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ORZAYAH', 10, 14);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Reçu de paiement', 10, 19);

    let y = 34;
    doc.setTextColor(dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Paiement confirmé', 10, y);
    y += 10;

    const row = (label: string, value: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(gray);
      doc.text(label, 10, y);
      doc.setTextColor(dark);
      doc.setFont('helvetica', 'bold');
      doc.text(value, 60, y);
      y += 7;
    };

    row('Bénéficiaire', businessName ?? '—');
    if (target?.description) row('Description', target.description);
    row('Montant', `${fcfa(receipt.amount ?? fixedAmount ?? 0)} FCFA`);
    if (receipt.feeAmount) row('Frais', `${fcfa(receipt.feeAmount)} FCFA`);
    row(
      'Total débité',
      `${fcfa((receipt.amount ?? fixedAmount ?? 0) + (receipt.feeAmount ?? 0))} FCFA`,
    );
    row('Référence', receipt.reference ?? receipt.id.slice(0, 12));
    row('Statut', 'Réussi');
    row('Date', receipt.createdAt ? new Date(receipt.createdAt).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR'));
    if (receipt.providerName) row('Fournisseur', receipt.providerName);

    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.line(10, y, 138, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(gray);
    doc.text("Ce reçu confirme un paiement effectué via ORZAYAH.", 10, y);
    y += 5;
    doc.text('© ORZAYAH — pay.orzayah.com', 10, y);

    doc.save(`recu-ORZAYAH-${(receipt.reference ?? receipt.id).slice(0, 10)}.pdf`);
  };

  const applyResponse = (res: PaymentResponse) => {
    setTransactionId(res.id);
    if (res.status === 'SUCCESS') {
      if (pollRef.current) clearInterval(pollRef.current);
      setReceipt(res);
      setResult({ status: 'success', message: 'Paiement confirmé ✓' });
    } else if (res.status === 'FAILED') {
      if (pollRef.current) clearInterval(pollRef.current);
      setResult({ status: 'failed', message: res.failureReason ?? "Le paiement n'a pas pu être finalisé." });
    } else if (res.nextActionType === 'otp') {
      if (pollRef.current) clearInterval(pollRef.current);
      setResult({
        status: 'otp',
        message: res.nextActionMessage ?? 'Saisis le code reçu par SMS pour confirmer.',
      });
    } else if (res.nextActionType === 'redirection' && res.nextActionUrl) {
      window.location.href = res.nextActionUrl;
    } else {
      setResult({
        status: 'pending',
        message: res.nextActionMessage ?? 'Vérifie ton téléphone et valide avec ton code Mobile Money pour finaliser le paiement.',
      });
    }
  };

  const startPolling = (id: string) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > 40) { // ~2 minutes à 3s d'intervalle
        if (pollRef.current) clearInterval(pollRef.current);
        setResult({ status: 'pending', message: "La confirmation prend plus de temps que prévu. Vérifie ton historique Mobile Money." });
        return;
      }
      try {
        const res = await apiFetch<PaymentResponse>(`/public/transactions/${id}/status`);
        applyResponse(res);
      } catch {
        // erreur réseau ponctuelle — on retente au prochain tick
      }
    }, 3000);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<PaymentResponse>(payExternalEndpoint, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          customerPhone: `+${dialCode}${localNumber.replace(/\D/g, '')}`,
          provider,
          amount: fixedAmount ? undefined : Math.round(Number(amount) * 100),
        }),
      });
      applyResponse(res);
      if (res.status !== 'SUCCESS' && res.status !== 'FAILED' && res.nextActionType !== 'otp') {
        startPolling(res.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec du paiement.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCard = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const phone = (dialCode && localNumber) ? ('+' + dialCode + localNumber.replace(/\D/g, '')) : '+2250000000000';
      const res = await apiFetch<PaymentResponse>(payExternalEndpoint, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          customerPhone: phone,
          provider: 'card',
          amount: fixedAmount ? undefined : Math.round(Number(amount) * 100),
          card: { cardNumber: cardNumber.replace(/\s/g, ''), expiryDate, cvv, cardholderName },
        }),
      });
      applyResponse(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Echec du paiement.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitOtp = async () => {
    if (!transactionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<PaymentResponse>(`/public/transactions/${transactionId}/authenticate`, {
        method: 'POST',
        body: JSON.stringify({ confirmationCode: otpCode }),
      });
      applyResponse(res);
      if (res.status !== 'SUCCESS' && res.status !== 'FAILED') {
        startPolling(transactionId);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="mp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
          <p style={{ color: 'var(--fz-text-secondary)' }}>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-header">
        <div className="mp-header-row" style={{ justifyContent: 'center' }}>
          {/* Logo officiel recadré (sans marge transparente) : parfaitement centré et net. */}
          <img src="/brand/orzayah-logo-entete.png" alt="ORZAYAH" style={{ height: 48, width: 'auto', display: 'block' }} />
        </div>
      </div>

      <div className="mp-balance-card" style={{ textAlign: 'center' }}>
        <div className="mp-balance-label">Vous êtes sur le point de payer</div>
        <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 800, marginTop: 8 }}>
          {businessName ?? (target ? '—' : 'Chargement...')}
        </div>
        {beneficiaryPhone && (
          <div style={{ fontSize: 14.5, fontWeight: 600, opacity: 0.9, marginTop: 4, letterSpacing: 0.4 }}>
            {maskPhone(beneficiaryPhone)}
          </div>
        )}
        {target?.description && (
          <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4 }}>{target.description}</div>
        )}
        {fixedAmount ? (
          <div className="mp-balance-amount" style={{ marginTop: 10 }}>
            {fcfa(fixedAmount)}
            <span className="currency">FCFA</span>
          </div>
        ) : (
          target && <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 8 }}>Montant libre</div>
        )}
      </div>

      {target && mode === 'choice' && !result && (
        <div className="mp-feature-list">
          <a
            href={walletAppPath === 'envoyer' ? `${walletAppUrl}/envoyer` : `${walletAppUrl}/${walletAppPath}?${walletAppQueryKey}=${identifier}`}
            className="mp-feature-card featured"
          >
            {/* § Icône officielle ORZAYAH (« OR ») : même visuel que le logo. */}
            <img
              src="/brand/orzayah-icone-128.png"
              alt="ORZAYAH"
              style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, display: 'block' }}
            />
            <div className="mp-feature-text">
              <div className="mp-feature-title">Payer avec ORZAYAH</div>
              <div className="mp-feature-sub">{mobilePaySubtitle}</div>
            </div>
            <div className="mp-feature-chevron">→</div>
          </a>
          <div className="mp-feature-card" onClick={() => setMode('external')}>
            <div className="mp-feature-icon">📱</div>
            <div className="mp-feature-text">
              <div className="mp-feature-title">Payer avec un autre Mobile Money</div>
              <div className="mp-feature-sub">Orange, MTN, Moov ou Wave — sans compte ORZAYAH</div>
            </div>
            <div className="mp-feature-chevron">→</div>
          </div>
          {/* § Paiement carte : format de requete HUB2 confirme par leur
              propre schema OpenAPI (paymentMethod=credit_card), mais le canal
              n'est pas encore active par HUB2 sur ce compte marchand — un
              echec cote leur infrastructure reste possible en attendant. */}
          <div className="mp-feature-card" style={{ cursor: 'pointer' }} onClick={() => setMode('card')}>
            <img src="/brand/moyens-paiement.png" alt="Visa, Mastercard, PayPal" style={{ height: 40, width: 'auto', flexShrink: 0, display: 'block' }} />
            <div className="mp-feature-text" style={{ marginLeft: 12 }}>
              <div className="mp-feature-title">Payer par carte bancaire</div>
              <div className="mp-feature-sub">Le type de carte est reconnu à la saisie du numéro</div>
            </div>
            <div className="mp-feature-chevron">→</div>
          </div>
        </div>
      )}

      {target && mode === 'external' && !result && (
        <div className="mp-form">
          <button
            onClick={() => { setMode('choice'); setError(null); }}
            className="mp-btn-ghost"
            style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12.5 }}
          >
            ← Retour
          </button>
          <select className="mp-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Ton opérateur...</option>
            {MOMO_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <span
              className="mp-input"
              style={{ width: 60, flexShrink: 0, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              +{dialCode}
            </span>
            <input
              className="mp-input"
              style={{ flex: 1 }}
              placeholder="0700000000"
              inputMode="tel"
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {!fixedAmount && (
            <input className="mp-input" type="number" placeholder="Montant (FCFA)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
          {error && <div className="mp-error">{error}</div>}
          <button
            className="mp-btn-primary"
            disabled={submitting || !localNumber || !provider || (!fixedAmount && !amount)}
            onClick={submit}
          >
            {submitting ? 'Envoi...' : 'Payer maintenant'}
          </button>
        </div>
      )}

      {target && mode === 'card' && !result && (
        <div className="mp-form">
          <button onClick={() => { setMode('choice'); setError(null); }} style={{ background: 'none', border: 'none', color: 'var(--fz-text-secondary)', fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
            ← Retour
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <img src="/brand/moyens-paiement.png" alt="Visa, Mastercard, PayPal" style={{ height: 52, width: 'auto', display: 'block' }} />
          </div>
          <input
            className="mp-input"
            placeholder="Numéro de carte"
            inputMode="numeric"
            autoComplete="cc-number"
            maxLength={23}
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
            style={{ marginBottom: 6, letterSpacing: 1 }}
          />
          {(() => {
            const chiffres = cardNumber.replace(/\D/g, '');
            if (chiffres.length < 2) return <div style={{ height: 10 }} />;
            const reseau = reseauCarte(chiffres);
            const complet = chiffres.length >= 13;
            const erreurSaisie = complet && !numeroCarteValide(chiffres);
            const couleur = erreurSaisie || (!reseau && chiffres.length >= 4) ? '#d64545' : 'var(--mp-navy, #0f2d52)';
            return (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginBottom: 10 }}>
                {erreurSaisie
                  ? 'Numéro de carte invalide : vérifiez la saisie.'
                  : reseau
                    ? `✓ ${LIBELLE_RESEAU[reseau]}`
                    : chiffres.length >= 4 ? 'Carte non reconnue : seules Visa et Mastercard sont acceptées.' : ''}
              </div>
            );
          })()}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input className="mp-input" placeholder="MM/AA" inputMode="numeric" maxLength={5} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value.replace(/[^0-9/]/g, ''))} style={{ flex: 1 }} />
            <input className="mp-input" placeholder="CVV" inputMode="numeric" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} style={{ flex: 1 }} />
          </div>
          <input className="mp-input" placeholder="Nom sur la carte" value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} style={{ marginBottom: 16 }} />
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button className="mp-btn-primary" disabled={submitting || !reseauCarte(cardNumber) || !numeroCarteValide(cardNumber) || !expiryDate || !cvv || !cardholderName} onClick={submitCard}>
            {submitting ? 'Traitement...' : 'Payer'}
          </button>
        </div>
      )}

      {result && (
        <div className="mp-form" style={{ textAlign: 'center' }}>
          {result.status === 'otp' ? (
            <>
              <p style={{ fontSize: 13.5, color: 'var(--fz-text-secondary)' }}>{result.message}</p>
              <input
                className="mp-input"
                placeholder="Code reçu par SMS"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              {error && <div className="mp-error">{error}</div>}
              <button className="mp-btn-primary" disabled={submitting || otpCode.length < 4} onClick={submitOtp}>
                {submitting ? 'Vérification...' : 'Confirmer le code'}
              </button>
            </>
          ) : (
            <>
              {result.status === 'success' ? (
                <div className="mp-success-burst">
                  {showConfetti &&
                    CONFETTI_PIECES.map((p, i) => (
                      <span
                        key={i}
                        className="mp-confetti-piece"
                        style={{
                          // @ts-expect-error -- variables CSS personnalisées
                          '--tx': `${p.tx}px`,
                          '--ty': `${p.ty}px`,
                          '--delay': `${p.delay}ms`,
                          background: p.color,
                          width: p.size,
                          height: p.size,
                          borderRadius: p.shape,
                        }}
                      />
                    ))}
                  <svg className="mp-success-check" viewBox="0 0 68 68" fill="none">
                    <circle className="mp-success-check-circle" cx="34" cy="34" r="30" />
                    <path className="mp-success-check-mark" d="M20 35 L30 45 L48 24" />
                  </svg>
                </div>
              ) : (
                <div style={{ fontSize: 40, marginBottom: 8 }}>
                  {result.status === 'failed' ? '❌' : '⏳'}
                </div>
              )}
              <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--fz-text-primary)' }}>
                {result.status === 'success' ? <>{result.message} 🎉</> : result.message}
              </p>
              {result.status === 'success' && receipt && (
                <>
                  <div
                    style={{
                      background: 'var(--fz-surface)', border: '1px solid var(--fz-border)', borderRadius: 14,
                      padding: '14px 16px', marginTop: 4, marginBottom: 14, textAlign: 'left', fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--fz-text-primary)' }}>📋 Détails du paiement</div>
                    {[
                      ['Bénéficiaire', businessName ?? '—'],
                      ...(target?.description ? [['Description', target.description]] : []),
                      ['Montant', `${fcfa(receipt.amount ?? fixedAmount ?? 0)} FCFA`],
                      ...(receipt.feeAmount ? [['Frais', `${fcfa(receipt.feeAmount)} FCFA`]] : []),
                      ['Total débité', `${fcfa((receipt.amount ?? fixedAmount ?? 0) + (receipt.feeAmount ?? 0))} FCFA`],
                      ['Référence', receipt.reference ?? receipt.id.slice(0, 12)],
                      ['Date', receipt.createdAt ? new Date(receipt.createdAt).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR')],
                      ...(receipt.providerName ? [['Fournisseur', receipt.providerName]] : []),
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--fz-border)' }}>
                        <span style={{ color: 'var(--fz-text-secondary)' }}>{k}</span>
                        <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button className="mp-btn-primary" onClick={downloadReceipt}>
                    📄 Télécharger le reçu (PDF)
                  </button>
                </>
              )}
              {result.status === 'failed' && (
                <button
                  className="mp-btn-primary"
                  onClick={() => { setResult(null); setMode('external'); setError(null); }}
                >
                  Réessayer
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
