'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function RetourContent() {
  const params = useSearchParams();
  const statut = params.get('statut');
  const transactionId = params.get('id');

  const [confirmed, setConfirmed] = useState<'SUCCESS' | 'FAILED' | 'PENDING' | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!transactionId) return;

    const check = () => {
      fetch((process.env.NEXT_PUBLIC_API_URL || 'https://mobilepay-v2-api.onrender.com/api') + '/public/transactions/' + transactionId + '/status')
        .then((r) => r.json())
        .then((json) => {
          const tx = json?.data ?? json;
          if (tx.status === 'SUCCESS') {
            setConfirmed('SUCCESS');
            return;
          }
          if (tx.status === 'FAILED') {
            setConfirmed('FAILED');
            return;
          }
          attemptsRef.current += 1;
          if (attemptsRef.current < 15) {
            setTimeout(check, 2000);
          } else {
            setConfirmed('FAILED');
          }
        })
        .catch(() => {
          attemptsRef.current += 1;
          if (attemptsRef.current < 15) {
            setTimeout(check, 2000);
          } else {
            setConfirmed(statut === 'succes' ? 'SUCCESS' : 'FAILED');
          }
        });
    };

    check();
  }, [transactionId, statut]);

  const stillChecking = confirmed === null;
  const success = confirmed === 'SUCCESS';

  return (
    <div style={{ minHeight: '100vh', background: '#0B0F1A', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>
        {stillChecking ? '⏳' : success ? '✅' : '⚠️'}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        {stillChecking ? 'Verification en cours...' : success ? 'Paiement confirme !' : "Le paiement n'a pas abouti"}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', maxWidth: 320, marginBottom: 32 }}>
        {stillChecking
          ? 'Merci de patienter quelques instants, la confirmation peut prendre jusqu a une minute.'
          : success
          ? 'Merci, ta transaction a bien ete traitee.'
          : 'Verifie ton solde Mobile Money et reessaie depuis le lien recu.'}
      </p>

      <div style={{ width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, background: 'linear-gradient(135deg, rgba(0,210,122,0.15), rgba(0,210,122,0.05))', border: '1px solid rgba(0,210,122,0.3)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#00D27A', marginBottom: 8, textTransform: 'uppercase' }}>
          Va plus loin avec ORZAYAH
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
          Wallet, transferts, factures, cartes cadeaux et bien plus - installe l'application et gere tout depuis un seul endroit.
        </p>
        <a href="https://wallet.orzayah.com" style={{ display: 'block', textAlign: 'center', background: '#00D27A', color: '#000', fontWeight: 700, padding: '14px', borderRadius: 12, textDecoration: 'none' }}>
          Decouvrir l'application
        </a>
      </div>
    </div>
  );
}

export default function RetourPage() {
  return (
    <Suspense fallback={null}>
      <RetourContent />
    </Suspense>
  );
}