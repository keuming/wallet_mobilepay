'use client';

import { useState } from 'react';

export type PaymentMethodId =
  | 'MOBILEPAY'
  | 'ORANGE'
  | 'MOOV'
  | 'WAVE'
  | 'MTN'
  | 'VISA'
  | 'MASTERCARD';

interface MethodMeta {
  label: string;
  fallbackBg: string;
  fallbackEmoji: string;
  logoFile: string; // chemin attendu dans /public/logos/ — voir README du dossier
}

const METHODS: Record<PaymentMethodId, MethodMeta> = {
  MOBILEPAY: { label: 'MobilePay', fallbackBg: 'linear-gradient(135deg,#47b686,#0d9488)', fallbackEmoji: '💚', logoFile: 'mobilepay.png' },
  ORANGE: { label: 'Orange Money', fallbackBg: '#FF6600', fallbackEmoji: '🟠', logoFile: 'orange-money.png' },
  MOOV: { label: 'Moov Money', fallbackBg: '#0072CE', fallbackEmoji: '🔵', logoFile: 'moov-money.png' },
  WAVE: { label: 'Wave', fallbackBg: '#1DC8E8', fallbackEmoji: '💙', logoFile: 'wave.png' },
  MTN: { label: 'MTN Money', fallbackBg: '#FFCC00', fallbackEmoji: '🟡', logoFile: 'mtn-money.png' },
  VISA: { label: 'Visa', fallbackBg: '#1A1F71', fallbackEmoji: '💳', logoFile: 'visa.png' },
  MASTERCARD: { label: 'Mastercard', fallbackBg: '#EB001B', fallbackEmoji: '💳', logoFile: 'mastercard.png' },
};

/**
 * Badge d'un mode de paiement — logo officiel si disponible dans
 * /public/logos/ (fournis sous licence agrégateur), sinon repli sur un badge
 * coloré cohérent avec l'identité de marque. Aucun fichier logo n'est fourni
 * par défaut : voir apps/web/public/logos/README.md pour les déposer.
 */
export default function PaymentMethodBadge({
  method,
  size = 32,
  showLabel = false,
}: {
  method: PaymentMethodId;
  size?: number;
  showLabel?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = METHODS[method];

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {!imgFailed ? (
        <img
          src={`/logos/${meta.logoFile}`}
          alt={meta.label}
          width={size}
          height={size}
          style={{ borderRadius: size / 4, objectFit: 'contain', background: 'white' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          style={{
            width: size,
            height: size,
            borderRadius: size / 4,
            background: meta.fallbackBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.55,
            flexShrink: 0,
          }}
        >
          {meta.fallbackEmoji}
        </span>
      )}
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

export { METHODS as PAYMENT_METHOD_META };
