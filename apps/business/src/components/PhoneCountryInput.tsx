'use client';

import { HUB2_COUNTRIES } from '../lib/hub2Countries';

interface PhoneCountryInputProps {
  country: string;
  onCountryChange: (code: string) => void;
  localNumber: string;
  onLocalNumberChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
}

/**
 * Sélecteur de pays (couverture HUB2 réelle) + numéro local — l'utilisateur
 * ne tape jamais l'indicatif lui-même. Utilisé à la connexion et à
 * l'inscription pour éviter la confusion "+225..." (§ correction).
 */
export default function PhoneCountryInput({
  country,
  onCountryChange,
  localNumber,
  onLocalNumberChange,
  label = 'Numéro de téléphone',
  autoFocus,
}: PhoneCountryInputProps) {
  const dialCode = HUB2_COUNTRIES.find((c) => c.code === country)?.dialCode ?? '225';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label>
        Pays
        <select
          className="mp-input"
          style={{ width: '100%', marginTop: 6 }}
          value={country}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          {HUB2_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </label>
      <label>
        {label}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <span
            className="mp-input"
            style={{ width: 66, flexShrink: 0, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fz-text-secondary)' }}
          >
            +{dialCode}
          </span>
          <input
            className="mp-input"
            style={{ flex: 1 }}
            value={localNumber}
            onChange={(e) => onLocalNumberChange(e.target.value.replace(/\D/g, ''))}
            placeholder="0700000000"
            inputMode="tel"
            autoFocus={autoFocus}
          />
        </div>
      </label>
    </div>
  );
}
