'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import jsQR from 'jsqr';
import { apiFetch, ApiError } from '../../lib/apiClient';
import StatusModal, { ResultStatus } from '../../components/StatusModal';
import PaymentMethodBadge, { PaymentMethodId } from '../../components/PaymentMethodBadge';
import PasswordInput from '../../components/PasswordInput';

// Note MVP : la lecture caméra du QR (scan) n'est pas implémentée ici — l'app
// mobile Flutter branchera un vrai scanner et appellera les mêmes endpoints
// (`GET /qr/:code` pour résoudre, `POST /qr/:code/pay` pour payer). Cette page
// web permet de saisir le code manuellement pour tester le flux de bout en bout.

type FundingSource = 'WALLET' | 'MOBILE_MONEY' | 'CARD';
type MomoOperator = 'ORANGE' | 'MOOV' | 'WAVE' | 'MTN';

const MOMO_OPTIONS: Array<{ id: MomoOperator; badge: PaymentMethodId; label: string }> = [
  { id: 'ORANGE', badge: 'ORANGE', label: 'Orange Money' },
  { id: 'MOOV', badge: 'MOOV', label: 'Moov Money' },
  { id: 'WAVE', badge: 'WAVE', label: 'Wave' },
  { id: 'MTN', badge: 'MTN', label: 'MTN Money' },
];

interface ResolvedTarget {
  kind: 'qr' | 'link';
  ref: string; // code QR ou slug du lien
  merchantName: string;
  fixedAmount: number | null;
}

const STEPS = ['Marchand', 'Montant', 'Paiement', 'Résumé', 'Code secret'];

// Next.js exige que tout composant utilisant useSearchParams() soit
// enveloppé dans un <Suspense> pour l'export statique en production.
export default function PayerPage() {
  return (
    <Suspense fallback={null}>
      <PayerContent />
    </Suspense>
  );
}

function PayerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [target, setTarget] = useState<ResolvedTarget | null>(null);

  // § Scanner QR par caméra (même logique que pay.mobilepay-ci.com) — repli
  // sur la saisie manuelle si la caméra est refusée/indisponible.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const [amount, setAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [categories, setCategories] = useState<{ id: string; label: string; icon: string | null }[]>([]);
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [feeLoading, setFeeLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [fundingSource, setFundingSource] = useState<FundingSource | null>(null);
  const [momoOperator, setMomoOperator] = useState<MomoOperator | null>(null);
  const [momoAccount, setMomoAccount] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [pin, setPin] = useState('');
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  // Action requise côté client (§ OTP/USSD/redirection) — découverte de
  // façon asynchrone via webhook, jamais dans la réponse immédiate.
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<{ type: 'ussd' | 'otp' | 'redirection'; message: string; url?: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  const pollTransactionStatus = (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~2 minutes — le client peut mettre du temps à valider (lien Wave, OTP...)
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const tx = await apiFetch<{
          status: string;
          nextActionType?: 'ussd' | 'otp' | 'redirection';
          nextActionMessage?: string;
          nextActionUrl?: string;
          failureReason?: string;
        }>(`/transactions/${transactionId}`);

        if (tx.status === 'SUCCESS') {
          clearInterval(interval);
          setPendingTransactionId(null);
          setNextAction(null);
          setResult({
            status: 'success',
            message: `Paiement réussi ! ${(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA payés à ${target?.merchantName}. 🎉`,
          });
        } else if (tx.status === 'FAILED') {
          clearInterval(interval);
          setPendingTransactionId(null);
          setNextAction(null);
          setResult({ status: 'failed', message: tx.failureReason ?? "Le paiement n'a pas pu être finalisé." });
        } else if (tx.nextActionType && !nextAction) {
          // On continue de surveiller (sans couper l'intervalle) — sinon le
          // vrai succès/échec, qui arrive plus tard via webhook, ne serait
          // jamais détecté et la fenêtre resterait ouverte indéfiniment.
          setResult(null);
          setNextAction({
            type: tx.nextActionType,
            message: tx.nextActionMessage ?? '',
            url: tx.nextActionUrl,
          });
        }
      } catch {
        // on retente au prochain tick
      }
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 2000);
  };

  const submitOtp = async () => {
    if (!pendingTransactionId) return;
    setOtpSubmitting(true);
    try {
      await apiFetch(`/transactions/${pendingTransactionId}/authenticate`, {
        method: 'POST',
        body: JSON.stringify({ confirmationCode: otpCode }),
      });
      setNextAction(null);
      setOtpCode('');
      pollTransactionStatus(pendingTransactionId);
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : "Échec de l'authentification." });
    } finally {
      setOtpSubmitting(false);
    }
  };

  useEffect(() => {
    apiFetch<{ hasPin: boolean }>('/auth/pin/status').then((res) => setHasPin(res.hasPin));
    apiFetch<{ cachedBalance: number }>('/wallet').then((w) => setWalletBalance(w.cachedBalance));
    apiFetch<{ id: string; label: string; icon: string | null }[]>('/expenses/categories').then(setCategories);
  }, []);

  const handleResolve = async (overrideCode?: string) => {
    const codeToResolve = overrideCode ?? code;
    setResolveError(null);
    try {
      // On tente d'abord comme QR, puis comme Payment Link — l'utilisateur peut
      // coller l'un ou l'autre indifféremment.
      try {
        const qr = await apiFetch<any>(`/qr/${codeToResolve}`, { auth: false });
        setTarget({
          kind: 'qr',
          ref: codeToResolve,
          merchantName: qr.merchant?.businessName ?? 'Marchand',
          fixedAmount: qr.fixedAmount ?? null,
        });
      } catch {
        const link = await apiFetch<any>(`/payment-links/${codeToResolve}`, { auth: false });
        setTarget({
          kind: 'link',
          ref: codeToResolve,
          merchantName: link.merchant?.businessName ?? 'Marchand',
          fixedAmount: link.amount ?? null,
        });
      }
      setStep(1);
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'QR ou lien introuvable.');
    }
  };

  // Préremplissage automatique depuis pay.mobilepay-ci.com (§ page publique) —
  // le client a choisi "Payer avec MobilePay" et arrive ici avec le QR/lien
  // déjà identifié, pas besoin de le ressaisir.
  useEffect(() => {
    const qrCode = searchParams.get('qr');
    const linkSlug = searchParams.get('link');
    const autoTarget = qrCode ?? linkSlug;
    if (autoTarget) {
      setCode(autoTarget);
      handleResolve(autoTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // § Scanner QR par caméra — actif uniquement à l'étape 0, tant qu'aucun
  // code n'a encore été détecté.
  useEffect(() => {
    if (step !== 0 || scanned) return;
    let cancelled = false;

    const extractCode = (raw: string): string => {
      try {
        const url = new URL(raw);
        const parts = url.pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || raw;
      } catch {
        return raw; // pas une URL — déjà un simple code
      }
    };

    const tick = () => {
      if (cancelled) return;
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
            const extracted = extractCode(result.data);
            setScanned(true);
            setCode(extracted);
            handleResolve(extracted);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

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
        setCameraError("Caméra indisponible — utilise la saisie manuelle ci-dessous.");
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scanned]);

  const canGoNext = (): boolean => {
    switch (step) {
      case 1:
        return !!target?.fixedAmount || (!!amount && Number(amount) > 0);
      case 2:
        if (fundingSource === 'MOBILE_MONEY') return !!momoOperator && momoAccount.replace(/\D/g, '').length >= 8;
        if (fundingSource === 'CARD') {
          return (
            cardName.trim().length >= 2 &&
            cardNumber.replace(/\D/g, '').length === 16 &&
            /^\d{2}\/\d{2}$/.test(cardExpiry) &&
            cardCvv.length === 3
          );
        }
        return fundingSource === 'WALLET';
      case 3:
        return true;
      case 4:
        return pin.length >= 4;
      default:
        return false;
    }
  };

  const effectiveAmount = target?.fixedAmount ?? (amount ? Math.round(Number(amount) * 100) : 0);

  useEffect(() => {
    if (step !== 3 || !effectiveAmount) return;
    setFeeLoading(true);
    apiFetch<{ feeAmount: string }>(`/pricing/preview?amount=${effectiveAmount / 100}`)
      .then((res) => setFeeAmount(Number(res.feeAmount)))
      .catch(() => setFeeAmount(null))
      .finally(() => setFeeLoading(false));
  }, [step, effectiveAmount]);


  const handleSubmit = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const path = target.kind === 'qr' ? `/qr/${target.ref}/pay` : `/payment-links/${target.ref}/pay`;
      const response = await apiFetch<{ status?: string; id?: string }>(path, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({
          amount: target.fixedAmount ? undefined : effectiveAmount,
          fundingSource,
          pin,
          customerPhone: fundingSource === 'MOBILE_MONEY' ? momoAccount : undefined,
          provider: fundingSource === 'MOBILE_MONEY' ? momoOperator : undefined,
          cardLast4: fundingSource === 'CARD' ? cardNumber.replace(/\D/g, '').slice(-4) : undefined,
          cardExpiryMonth: fundingSource === 'CARD' ? Number(cardExpiry.split('/')[0]) : undefined,
          cardExpiryYear: fundingSource === 'CARD' ? Number(`20${cardExpiry.split('/')[1]}`) : undefined,
        }),
      });

      if (response.status === 'SUCCESS') {
        if (expenseCategoryId && response.id) {
          apiFetch(`/expenses/transactions/${response.id}/category`, {
            method: 'PATCH',
            body: JSON.stringify({ categoryId: expenseCategoryId }),
          }).catch(() => {});
        }
        setResult({
          status: 'success',
          message: `Paiement réussi ! ${(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA payés à ${target.merchantName}. 🎉`,
        });
      } else if (response.status === 'PROCESSING' || response.status === 'PENDING') {
        if (response.id && expenseCategoryId) {
          apiFetch(`/expenses/transactions/${response.id}/category`, {
            method: 'PATCH',
            body: JSON.stringify({ categoryId: expenseCategoryId }),
          }).catch(() => {});
        }
        if (response.id && fundingSource === 'MOBILE_MONEY') {
          setPendingTransactionId(response.id);
          pollTransactionStatus(response.id);
          setResult({ status: 'pending', message: 'Vérification en cours...' });
        } else {
          setResult({
            status: 'pending',
            message: 'Votre paiement est en attente de confirmation par votre opérateur Mobile Money.',
          });
        }
      } else if (response.status === 'FAILED') {
        setResult({ status: 'failed', message: 'Le paiement n\'a pas pu être finalisé.' });
      } else {
        setResult({ status: 'unknown', message: 'Réponse du serveur incomplète. Vérifiez votre historique.' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setResult({ status: 'failed', message: err.message });
      } else {
        setResult({
          status: 'unknown',
          message: 'Impossible de contacter le serveur. Vérifiez votre connexion puis consultez votre historique.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (step === STEPS.length - 1) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  };

  if (hasPin === false) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/dashboard" className="mp-back-link">
            ← Retour
          </Link>
          <h1>🏪 Payer un marchand</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <p style={{ fontWeight: 700, color: 'var(--fz-text-primary)' }}>Code secret requis</p>
          <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13.5, marginBottom: 16 }}>
            Vous devez créer un code secret transactionnel avant de pouvoir payer.
          </p>
          <Link href="/code-secret" className="mp-btn-primary" style={{ display: 'inline-block' }}>
            Créer mon code secret
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        {step === 0 ? (
          <Link href="/dashboard" className="mp-back-link">
            ← Retour
          </Link>
        ) : (
          <button onClick={() => setStep((s) => s - 1)} className="mp-back-link">
            ← Précédent
          </button>
        )}
        <h1>🏪 Payer un marchand</h1>
        {step > 0 && (
          <>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4, position: 'relative' }}>
              Étape {step + 1}/{STEPS.length} — {STEPS[step]}
            </div>
            <div className="mp-step-track">
              {STEPS.map((_, i) => (
                <div key={i} className={`mp-step-dot ${i <= step ? 'active' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Étape 0 : résolution QR/lien */}
      {step === 0 && (
        <div className="mp-form">
          <p style={{ fontSize: 13.5, color: 'var(--fz-text-secondary)', margin: 0 }}>
            Vise le QR code du marchand, ou colle son code / lien de paiement ci-dessous.
          </p>

          {!cameraError && (
            <div style={{ position: 'relative', width: '100%', maxWidth: 280, margin: '0 auto', borderRadius: 18, overflow: 'hidden', background: '#000', aspectRatio: '1 / 1' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div
                style={{
                  position: 'absolute',
                  inset: '14%',
                  border: '3px solid rgba(255,255,255,0.85)',
                  borderRadius: 14,
                  boxShadow: '0 0 0 2000px rgba(0,0,0,0.25)',
                }}
              />
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {cameraError && <div style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)', textAlign: 'center' }}>{cameraError}</div>}

          <label>
            Code QR ou lien de paiement
            <input
              className="mp-input"
              style={{ width: '100%', marginTop: 6 }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MPMDEMOMERCHANT01"
            />
          </label>
          {resolveError && <div className="mp-error">{resolveError}</div>}
          <button className="mp-btn-primary" disabled={!code} onClick={() => handleResolve()}>
            Continuer
          </button>
        </div>
      )}

      <div className="mp-form">
        {/* Étape 1 : Montant */}
        {step === 1 && target && (
          <div className="fz-amount-hero">
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 4px', textAlign: 'center' }}>
              Indique le montant à payer à {target.merchantName}.
            </p>
            <span className="fz-amount-avatar">{target.merchantName.charAt(0).toUpperCase()}</span>
            <div>
              <div className="fz-amount-name">{target.merchantName}</div>
              <div className="fz-amount-sub">Marchand</div>
            </div>

            {target.fixedAmount ? (
              <div className="fz-amount-input-wrap">
                <span className="fz-amount-field" style={{ maxWidth: 'none' }}>
                  {(target.fixedAmount / 100).toLocaleString('fr-FR')}
                </span>
                <span className="fz-amount-currency">FCFA</span>
              </div>
            ) : (
              <>
                <div className="fz-amount-input-wrap">
                  <input
                    className="fz-amount-field"
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoFocus
                  />
                  <span className="fz-amount-currency">FCFA</span>
                </div>
                <div className="fz-amount-chips">
                  {['500', '1000', '2000', '5000'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmount(val)}
                      className={`fz-amount-chip ${amount === val ? 'selected' : ''}`}
                    >
                      {Number(val).toLocaleString('fr-FR')}
                    </button>
                  ))}
                </div>
              </>
            )}

            {walletBalance !== null && (
              <div className="fz-balance-badge">
                <span className="dot" />
                <span className="label">Solde :</span>
                <span className="value">{(walletBalance / 100).toLocaleString('fr-FR')} FCFA</span>
              </div>
            )}
          </div>
        )}

        {/* Étape 2 : Mode de financement */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 4px' }}>
              Veuillez choisir le moyen de paiement digital pour ce paiement.
            </p>
            <button
              onClick={() => setFundingSource('WALLET')}
              className={`mp-list-card ${fundingSource === 'WALLET' ? 'selected' : ''}`}
            >
              💰 Solde MobilePay (rapide)
            </button>
            <div style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)', fontWeight: 600, marginTop: 4 }}>
              MOBILE MONEY (prélèvement instantané)
            </div>
            {MOMO_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setFundingSource('MOBILE_MONEY');
                  setMomoOperator(o.id);
                }}
                className={`mp-list-card ${fundingSource === 'MOBILE_MONEY' && momoOperator === o.id ? 'selected' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <PaymentMethodBadge method={o.badge} size={26} />
                <span>{o.label}</span>
              </button>
            ))}
            {fundingSource === 'MOBILE_MONEY' && (
              <input
                className="mp-input"
                style={{ width: '100%' }}
                value={momoAccount}
                onChange={(e) => setMomoAccount(e.target.value)}
                placeholder="Numéro Mobile Money"
              />
            )}

            <div style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)', fontWeight: 600, marginTop: 4 }}>
              CARTE
            </div>
            <button
              onClick={() => setFundingSource('CARD')}
              className={`mp-list-card ${fundingSource === 'CARD' ? 'selected' : ''}`}
            >
              💳 Carte virtuelle
            </button>
            {fundingSource === 'CARD' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="mp-input"
                  style={{ width: '100%' }}
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Nom complet du titulaire"
                  autoComplete="cc-name"
                />
                <input
                  className="mp-input"
                  style={{ width: '100%' }}
                  value={cardNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
                    setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim());
                  }}
                  placeholder="1234 5678 9012 3456"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="mp-input"
                    style={{ flex: 1 }}
                    value={cardExpiry}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setCardExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                    }}
                    placeholder="MM/AA"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                  <input
                    className="mp-input"
                    style={{ flex: 1 }}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="CVV"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Étape 3 : Résumé */}
        {step === 3 && target && (
          <>
            <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
              Vérifie les détails avant de continuer vers la confirmation.
            </p>
            <div
              style={{
                background: 'var(--fz-surface)',
                border: '1.5px solid var(--fz-accent)',
                borderRadius: 16,
                padding: '16px 18px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fz-accent)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                🔍 Vérifiez avant de continuer
              </div>
              <div className="mp-detail-row">
                <span className="k">Objet</span>
                <span className="v">Paiement marchand</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Marchand</span>
                <span className="v">{target.merchantName}</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Montant</span>
                <span className="v" style={{ fontSize: 16, color: 'var(--fz-accent)' }}>
                  {(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Frais de transaction</span>
                <span className="v">
                  {feeLoading ? '...' : feeAmount !== null ? `${(feeAmount / 100).toLocaleString('fr-FR')} FCFA` : '—'}
                </span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Mode de paiement</span>
                <span className="v">
                  {fundingSource === 'WALLET'
                    ? 'Solde MobilePay'
                    : fundingSource === 'CARD'
                      ? `Carte virtuelle •••• ${cardNumber.replace(/\D/g, '').slice(-4)}`
                      : `Mobile Money — ${momoAccount}`}
                </span>
              </div>
            </div>
            {categories.length > 0 && (
              <label>
                Type de charge (optionnel)
                <select
                  className="mp-input"
                  style={{ width: '100%', marginTop: 6 }}
                  value={expenseCategoryId}
                  onChange={(e) => setExpenseCategoryId(e.target.value)}
                >
                  <option value="">Aucune catégorie</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="mp-btn-primary" onClick={goNext}>
              ✅ Continuer vers la validation
            </button>
            <button className="mp-btn-ghost" onClick={() => setStep(1)}>
              ✏️ Modifier les informations
            </button>
            <button
              className="mp-btn-ghost"
              style={{ color: 'var(--mp-red)', borderColor: 'rgba(214, 69, 69, 0.25)' }}
              onClick={() => router.push('/dashboard')}
            >
              ✕ Annuler le paiement
            </button>
          </>
        )}

        {/* Étape 4 : Code secret */}
        {step === 4 && target && (
          <>
            <div
              style={{
                background: 'var(--mp-surface)',
                border: '1px solid var(--mp-border)',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 4,
              }}
            >
              <div className="mp-detail-row">
                <span className="k">Marchand</span>
                <span className="v">{target.merchantName}</span>
              </div>
              <div className="mp-detail-row">
                <span className="k">Montant</span>
                <span className="v">{(effectiveAmount / 100).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
            <label>
              Code secret
              <PasswordInput
                className="mp-input"
                style={{ marginTop: 6, letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
              />
            </label>
          </>
        )}

        {step > 0 && step !== 3 && (
          <button className="mp-btn-primary" disabled={!canGoNext() || submitting} onClick={goNext}>
            {submitting ? 'Paiement...' : step === STEPS.length - 1 ? 'Valider et payer' : 'Suivant'}
          </button>
        )}
      </div>

      {nextAction?.type === 'ussd' && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div className="mp-success" style={{ textAlign: 'left' }}>
            Vérifie ton téléphone et valide avec ton code Mobile Money pour finaliser le paiement.
          </div>
        </div>
      )}

      {nextAction?.type === 'otp' && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div
            style={{
              background: 'rgba(184, 121, 10, 0.08)',
              border: '1px solid rgba(184, 121, 10, 0.2)',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <p style={{ fontSize: 12.5, color: '#8a5a06', margin: '0 0 10px' }}>{nextAction.message}</p>
            <input
              className="mp-input"
              style={{ width: '100%' }}
              placeholder="Code de confirmation"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
            />
            <button
              className="mp-btn-primary"
              style={{ marginTop: 8, width: '100%', background: 'linear-gradient(120deg, #b8790a 0%, #8a5a06 100%)' }}
              disabled={otpSubmitting || !otpCode}
              onClick={submitOtp}
            >
              {otpSubmitting ? 'Validation...' : 'Valider le code'}
            </button>
          </div>
        </div>
      )}

      {nextAction?.type === 'redirection' && nextAction.url && (
        <div className="mp-section" style={{ paddingTop: 0 }}>
          <div
            style={{
              background: 'var(--mp-surface)',
              border: '1px solid var(--mp-border)',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <p style={{ fontSize: 12.5, color: 'var(--fz-text-secondary)', margin: '0 0 10px' }}>
              Ouvre ce lien pour confirmer ton paiement :
            </p>
            <a href={nextAction.url} target="_blank" rel="noreferrer" className="mp-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ouvrir le lien de confirmation
            </a>
          </div>
        </div>
      )}

      {result && (
        <StatusModal
          status={result.status}
          message={result.message}
          onClose={() => {
            setResult(null);
            if (result.status === 'success') router.push('/dashboard');
          }}
          actions={
            <>
              {result.status === 'success' && (
                <button className="mp-btn-primary" onClick={() => router.push('/historique')}>
                  Voir dans l'historique
                </button>
              )}
              <button className="mp-btn-ghost" onClick={() => router.push('/dashboard')}>
                Retour à l'accueil
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
