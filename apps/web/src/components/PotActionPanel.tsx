'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '../lib/apiClient';
import PasswordInput from './PasswordInput';
import StatusModal, { ResultStatus } from './StatusModal';

interface PotType {
  id: string;
  label: string;
  icon: string | null;
  balance: string;
}

/**
 * Approvisionnement / retrait d'un pot (§ Collecte ou Épargne — même
 * logique). Débit du wallet vers le pot sélectionné (ou l'inverse pour un
 * retrait), confirmé par code secret.
 */
export default function PotActionPanel({
  kind,
  title,
  apiBase,
  typesHref,
}: {
  kind: 'collecte' | 'epargne';
  title: string;
  apiBase: string; // '/collecte/types' ou '/savings/types'
  typesHref: string; // '/types-collecte' ou '/types-epargne'
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselected = searchParams.get('type');

  const [types, setTypes] = useState<PotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);

  useEffect(() => {
    apiFetch<PotType[]>(apiBase)
      .then((list) => {
        setTypes(list);
        if (preselected && list.some((t) => t.id === preselected)) setSelectedId(preselected);
        else if (list.length > 0) setSelectedId(list[0].id);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = types.find((t) => t.id === selectedId);

  const submit = async () => {
    if (!selected || !amount || pin.length < 4) return;
    setSubmitting(true);
    try {
      const path = mode === 'deposit' ? `${apiBase}/${selected.id}/deposit` : `${apiBase}/${selected.id}/withdraw`;
      await apiFetch(path, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Number(amount), pin }),
      });
      setResult({
        status: 'success',
        message:
          mode === 'deposit'
            ? `${Number(amount).toLocaleString('fr-FR')} FCFA ajoutés à "${selected.label}" !`
            : `${Number(amount).toLocaleString('fr-FR')} FCFA retirés de "${selected.label}" vers ton wallet !`,
      });
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'Échec de l\'opération.' });
    } finally {
      setSubmitting(false);
      setPin('');
    }
  };

  if (loading) return null;

  if (types.length === 0) {
    return (
      <div className="mp-container">
        <div className="mp-page-header">
          <Link href="/dashboard" className="mp-back-link">← Retour</Link>
          <h1>{title}</h1>
        </div>
        <div className="mp-section" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--fz-text-secondary)', fontSize: 14 }}>
            Tu n'as pas encore créé de {kind === 'collecte' ? 'collecte' : 'épargne'}.
          </p>
          <Link href={typesHref} className="mp-btn-primary" style={{ display: 'inline-block', marginTop: 10 }}>
            + Créer ma première {kind === 'collecte' ? 'collecte' : 'épargne'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">← Retour</Link>
        <h1>{title}</h1>
      </div>

      <div className="mp-form">
        <label>
          {kind === 'collecte' ? 'Collecte' : 'Épargne'}
          <select className="mp-input" style={{ width: '100%', marginTop: 6 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.icon} {t.label} — {(Number(t.balance) / 100).toLocaleString('fr-FR')} FCFA</option>
            ))}
          </select>
        </label>
        <Link href={typesHref} style={{ fontSize: 12.5, color: 'var(--fz-accent)', fontWeight: 600 }}>
          + Gérer mes {kind === 'collecte' ? 'collectes' : 'épargnes'}
        </Link>

        <div className="fz-tab-row" style={{ marginTop: 8 }}>
          <button className={`fz-tab ${mode === 'deposit' ? 'active' : ''}`} onClick={() => setMode('deposit')}>
            Approvisionner
          </button>
          <button className={`fz-tab ${mode === 'withdraw' ? 'active' : ''}`} onClick={() => setMode('withdraw')}>
            Retirer
          </button>
        </div>

        <p style={{ color: 'var(--fz-text-secondary)', fontSize: 13, margin: 0 }}>
          {mode === 'deposit'
            ? `Le montant sera débité de ton solde MobilePay et ajouté à "${selected?.label ?? ''}".`
            : `Le montant sera retiré de "${selected?.label ?? ''}" et recrédité sur ton solde MobilePay.`}
        </p>

        <label>
          Montant (FCFA)
          <input
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant"
          />
        </label>

        <label>
          Code secret
          <PasswordInput
            className="mp-input"
            style={{ width: '100%', marginTop: 6 }}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            inputMode="numeric"
          />
        </label>

        <button className="mp-btn-primary" disabled={submitting || !amount || pin.length < 4} onClick={submit}>
          {submitting ? 'Traitement...' : mode === 'deposit' ? 'Approvisionner' : 'Retirer'}
        </button>
      </div>

      {result && (
        <StatusModal
          status={result.status}
          message={result.message}
          onClose={() => {
            setResult(null);
            if (result.status === 'success') router.push('/dashboard');
          }}
        />
      )}
    </div>
  );
}
