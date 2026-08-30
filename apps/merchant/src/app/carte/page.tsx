'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, ApiError } from '../../lib/apiClient';
import MerchantSideMenu from '../../components/MerchantSideMenu';

interface Card {
  id: string;
  ownerMerchantId: string | null;
  maskedPan: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  balance: number;
  status: 'PENDING' | 'ACTIVE' | 'FROZEN' | 'CLOSED';
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

export default function CartePage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [fetching, setFetching] = useState(true);
  const [holderName, setHolderName] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAmount, setLoadAmount] = useState('');
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = () => {
    apiFetch<Card[]>('/cards/mine')
      .then((all) => setCards(all.filter((c) => c.ownerMerchantId === activeMerchant?.merchantId)))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router]);

  if (loading || !user || !activeMerchant) return null;

  const requestCard = async () => {
    setRequesting(true);
    setError(null);
    try {
      await apiFetch('/cards', {
        method: 'POST',
        body: JSON.stringify({ holderName, merchantId: activeMerchant.merchantId }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la demande.');
    } finally {
      setRequesting(false);
    }
  };

  const loadCard = async (cardId: string) => {
    setBusyCard(cardId);
    setError(null);
    try {
      await apiFetch(`/cards/${cardId}/load`, {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify({ amount: Math.round(Number(loadAmount) * 100) }),
      });
      setLoadAmount('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec du chargement.');
    } finally {
      setBusyCard(null);
    }
  };

  const toggleFreeze = async (card: Card) => {
    setError(null);
    try {
      await apiFetch(`/cards/${card.id}/${card.status === 'FROZEN' ? 'unfreeze' : 'freeze'}`, {
        method: 'PATCH',
      });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  };

  return (
    <div className="mp-container">
      <div className="mp-header mc-business-header">
        <div className="mp-header-row">
          <button className="mp-icon-btn" onClick={() => setMenuOpen(true)} title="Menu">
            ☰
          </button>
          <span className="mp-brand-mark">
            <span className="dot" />
            Carte virtuelle
            <span className="mc-business-badge">BUSINESS</span>
          </span>
          <button onClick={() => logout().then(() => router.push('/login'))} className="mp-icon-btn" title="Déconnexion">
            ⏻
          </button>
        </div>
      </div>

      <MerchantSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="mp-section">
        <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: '0 0 16px' }}>
          Carte Visa/Mastercard prépayée, alimentée depuis le wallet marchand — utile pour payer vos
          fournisseurs en ligne.
        </p>

        {fetching ? (
          <p>Chargement...</p>
        ) : cards.length === 0 ? (
          <div className="mp-form" style={{ padding: 0 }}>
            <input className="mp-input" placeholder="Nom à imprimer sur la carte" value={holderName} onChange={(e) => setHolderName(e.target.value)} />
            {error && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
            <button
              className="mp-btn-primary"
              style={{ background: 'linear-gradient(120deg, var(--mp-navy) 0%, #0a1f3d 100%)' }}
              disabled={requesting || !holderName}
              onClick={requestCard}
            >
              {requesting ? 'Demande en cours...' : 'Demander une carte'}
            </button>
          </div>
        ) : (
          cards.map((card) => (
            <div
              key={card.id}
              style={{
                background: 'linear-gradient(135deg, #0f2d52, #0a8f58)',
                color: 'white',
                borderRadius: 18,
                padding: 22,
                marginBottom: 16,
                boxShadow: 'var(--mp-shadow-glow)',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 20 }}>MobilePay CI — Business</div>
              <div style={{ fontSize: 18, letterSpacing: 2, marginBottom: 16, fontFamily: 'Sora, sans-serif' }}>
                {card.maskedPan ?? '•••• •••• •••• ••••'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>
                  Exp. {card.expiryMonth?.toString().padStart(2, '0')}/{card.expiryYear}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: card.status === 'ACTIVE' ? 'rgba(74,222,128,.2)' : 'rgba(239,68,68,.2)',
                  }}
                >
                  {card.status}
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 16, fontFamily: 'Sora, sans-serif' }}>{fcfa(card.balance)} FCFA</div>

              {card.status === 'ACTIVE' && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <input
                    className="mp-input"
                    style={{ flex: 1, background: 'rgba(255,255,255,.1)', color: 'white', border: '1px solid rgba(255,255,255,.2)' }}
                    placeholder="Montant à charger"
                    type="number"
                    value={loadAmount}
                    onChange={(e) => setLoadAmount(e.target.value)}
                  />
                  <button
                    className="mp-btn-primary"
                    style={{ background: 'rgba(255,255,255,0.18)', boxShadow: 'none', padding: '0 18px' }}
                    disabled={busyCard === card.id || !loadAmount}
                    onClick={() => loadCard(card.id)}
                  >
                    Charger
                  </button>
                </div>
              )}

              <button
                onClick={() => toggleFreeze(card)}
                style={{
                  marginTop: 12,
                  background: 'none',
                  border: '1px solid rgba(255,255,255,.3)',
                  color: 'white',
                  borderRadius: 10,
                  padding: '8px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {card.status === 'FROZEN' ? '🔓 Dégeler la carte' : '🔒 Geler la carte'}
              </button>
            </div>
          ))
        )}
        {error && cards.length > 0 && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
