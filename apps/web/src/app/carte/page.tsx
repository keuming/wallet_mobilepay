'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/apiClient';
import StatusModal, { ResultStatus } from '../../components/StatusModal';

interface Card {
  id: string;
  maskedPan: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  balance: number;
  status: 'PENDING' | 'ACTIVE' | 'FROZEN' | 'CLOSED';
  currency: string;
}

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

export default function CartePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [holderName, setHolderName] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [result, setResult] = useState<{ status: ResultStatus; message: string } | null>(null);
  const [loadAmount, setLoadAmount] = useState('');
  const [loadingCard, setLoadingCard] = useState<string | null>(null);

  const refresh = () => apiFetch<Card[]>('/cards/mine').then(setCards).finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  const requestCard = async () => {
    setRequesting(true);
    try {
      await apiFetch('/cards', { method: 'POST', body: JSON.stringify({ holderName }) });
      setResult({ status: 'success', message: 'Demande de carte envoyée ! 🎉' });
      await refresh();
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'Échec de la demande.' });
    } finally {
      setRequesting(false);
    }
  };

  const loadCard = async (cardId: string) => {
    setLoadingCard(cardId);
    try {
      await apiFetch(`/cards/${cardId}/load`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Math.round(Number(loadAmount) * 100) }),
      });
      setLoadAmount('');
      setResult({ status: 'success', message: 'Carte rechargée avec succès ! 🎉' });
      await refresh();
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'Échec du chargement.' });
    } finally {
      setLoadingCard(null);
    }
  };

  const toggleFreeze = async (card: Card) => {
    try {
      await apiFetch(`/cards/${card.id}/${card.status === 'FROZEN' ? 'unfreeze' : 'freeze'}`, {
        method: 'PATCH',
      });
      await refresh();
    } catch (err) {
      setResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'Action impossible.' });
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>💎 Carte virtuelle</h1>
      </div>

      <div className="mp-section">
        {loading ? (
          <p style={{ color: 'var(--mp-muted)' }}>Chargement...</p>
        ) : cards.length === 0 ? (
          <div className="mp-form" style={{ padding: 0 }}>
            <p style={{ color: 'var(--mp-muted)', fontSize: 13.5 }}>
              Obtenez une carte virtuelle Visa/Mastercard adossée à votre wallet pour payer en ligne
              partout dans le monde.
            </p>
            <input
              className="mp-input"
              placeholder="Nom à imprimer sur la carte"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
            />
            <button className="mp-btn-primary" disabled={requesting || !holderName} onClick={requestCard}>
              {requesting ? 'Demande en cours...' : 'Demander une carte'}
            </button>
          </div>
        ) : (
          cards.map((card) => (
            <div
              key={card.id}
              style={{
                background: 'linear-gradient(150deg, #16345f 0%, #0f2d52 55%, #065f3c 130%)',
                color: 'white',
                borderRadius: 22,
                padding: 22,
                marginBottom: 16,
                boxShadow: '0 16px 40px -10px rgba(15, 45, 82, 0.45)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: '-40% -20% auto auto',
                  width: 200,
                  height: 200,
                  background: 'radial-gradient(circle, rgba(18,179,116,.35) 0%, transparent 70%)',
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 22, position: 'relative', fontWeight: 600 }}>
                MobilePay CI
              </div>
              <div style={{ fontSize: 19, letterSpacing: 3, marginBottom: 18, position: 'relative', fontFamily: 'Sora, sans-serif' }}>
                {card.maskedPan ?? '•••• •••• •••• ••••'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, position: 'relative' }}>
                <span>
                  Exp. {card.expiryMonth?.toString().padStart(2, '0')}/{card.expiryYear}
                </span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 12,
                    background: card.status === 'ACTIVE' ? 'rgba(18,179,116,.25)' : 'rgba(214,69,69,.25)',
                    color: card.status === 'ACTIVE' ? '#4fe3a3' : '#f8a5a5',
                    fontWeight: 600,
                  }}
                >
                  {card.status}
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 18, position: 'relative', fontFamily: 'Sora, sans-serif' }}>
                {fcfa(card.balance)}
              </div>

              {card.status === 'ACTIVE' && (
                <div style={{ marginTop: 18, display: 'flex', gap: 8, position: 'relative' }}>
                  <input
                    className="mp-input"
                    style={{ flex: 1, background: 'rgba(255,255,255,.12)', color: 'white', border: '1px solid rgba(255,255,255,.18)' }}
                    placeholder="Montant à charger"
                    type="number"
                    value={loadAmount}
                    onChange={(e) => setLoadAmount(e.target.value)}
                  />
                  <button
                    className="mp-btn-primary"
                    style={{ boxShadow: 'none' }}
                    disabled={loadingCard === card.id || !loadAmount}
                    onClick={() => loadCard(card.id)}
                  >
                    Charger
                  </button>
                </div>
              )}

              {(card.status === 'ACTIVE' || card.status === 'FROZEN') && (
                <button
                  onClick={() => toggleFreeze(card)}
                  style={{
                    marginTop: 14,
                    background: 'none',
                    border: '1px solid rgba(255,255,255,.3)',
                    color: 'white',
                    borderRadius: 10,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {card.status === 'FROZEN' ? '🔓 Dégeler la carte' : '🔒 Geler la carte'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {result && (
        <StatusModal status={result.status} message={result.message} onClose={() => setResult(null)} />
      )}
    </div>
  );
}
