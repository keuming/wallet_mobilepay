'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  network: 'VISA' | 'MASTERCARD';
}

function fcfa(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR');
}

function BrandMark({ network }: { network: 'VISA' | 'MASTERCARD' }) {
  if (network === 'MASTERCARD') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#eb001b', marginRight: -8 }} />
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#f79e1b', opacity: 0.85 }} />
      </span>
    );
  }
  return <span style={{ fontStyle: 'italic', fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>VISA</span>;
}

export default function CartePage() {
  const { user, loading, activeMerchant, logout } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [fetching, setFetching] = useState(true);
  const [holderName, setHolderName] = useState('');
  const [network, setNetwork] = useState<'VISA' | 'MASTERCARD'>('VISA');
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
        body: JSON.stringify({ holderName, merchantId: activeMerchant.merchantId, network }),
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
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600, marginBottom: 8 }}>
                Marque de la carte
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setNetwork('VISA')}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    borderRadius: 12,
                    border: network === 'VISA' ? '2px solid var(--mp-navy)' : '1px solid var(--mp-border)',
                    background: network === 'VISA' ? 'var(--mp-navy)' : 'white',
                    color: network === 'VISA' ? 'white' : 'var(--mp-navy)',
                    fontWeight: 800,
                    fontStyle: 'italic',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  VISA
                </button>
                <button
                  onClick={() => setNetwork('MASTERCARD')}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    borderRadius: 12,
                    border: network === 'MASTERCARD' ? '2px solid var(--mp-navy)' : '1px solid var(--mp-border)',
                    background: network === 'MASTERCARD' ? 'var(--mp-navy)' : 'white',
                    color: network === 'MASTERCARD' ? 'white' : 'var(--mp-navy)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <BrandMark network="MASTERCARD" /> Mastercard
                </button>
              </div>
            </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', marginBottom: 22 }}>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 600 }}>MobilePay CI — Business</span>
                <BrandMark network={card.network} />
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
                {fcfa(card.balance)} FCFA
              </div>

              {card.status === 'ACTIVE' && (
                <div style={{ marginTop: 20, position: 'relative' }}>
                  <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 6, fontWeight: 600 }}>
                    Recharger la carte
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
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
                      style={{ boxShadow: 'none', flexShrink: 0 }}
                      disabled={busyCard === card.id || !loadAmount}
                      onClick={() => loadCard(card.id)}
                    >
                      Charger
                    </button>
                  </div>
                </div>
              )}

              {(card.status === 'ACTIVE' || card.status === 'FROZEN') && (
                <button
                  onClick={() => toggleFreeze(card)}
                  style={{
                    marginTop: 16,
                    background: 'none',
                    border: '1px solid rgba(255,255,255,.3)',
                    color: 'white',
                    borderRadius: 10,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    position: 'relative',
                    fontFamily: 'inherit',
                  }}
                >
                  {card.status === 'FROZEN' ? '🔓 Dégeler la carte' : '🔒 Geler la carte'}
                </button>
              )}
            </div>
          ))
        )}
        {error && cards.length > 0 && <div style={{ color: 'var(--mp-red)', fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
