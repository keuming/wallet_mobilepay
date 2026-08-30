'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(phone, password);
      // Transition animée avant de rejoindre le dashboard, plutôt qu'une
      // redirection brutale.
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1300);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
      setSubmitting(false);
    }
  };

  return (
    <div className="adm-login-bg">
      <div className="adm-login-orb adm-login-orb-1" />
      <div className="adm-login-orb adm-login-orb-2" />
      <div className="adm-login-orb adm-login-orb-3" />

      <div className="adm-login-split">
        {/* Colonne gauche — illustration + message */}
        <div className="adm-login-left">
          <div className="adm-login-illustration">
            <svg viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="40" width="200" height="130" rx="14" fill="#0a8f58" fillOpacity="0.12" />
              <rect x="40" y="60" width="160" height="16" rx="8" fill="#0a8f58" fillOpacity="0.35" />
              <rect x="40" y="86" width="100" height="12" rx="6" fill="#0a8f58" fillOpacity="0.22" />
              <rect x="40" y="106" width="70" height="45" rx="8" fill="#0d9488" fillOpacity="0.3" />
              <rect x="120" y="106" width="70" height="45" rx="8" fill="#12b374" fillOpacity="0.3" />
              <circle cx="60" cy="128" r="10" fill="#0a8f58" />
              <circle cx="150" cy="122" r="8" fill="#0d9488" />
              <path d="M45 145 L60 130 L75 138 L95 118" stroke="#076b45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="200" cy="30" r="14" fill="#12b374" fillOpacity="0.5" />
              <circle cx="18" cy="170" r="10" fill="#0d9488" fillOpacity="0.4" />
            </svg>
          </div>
          <div className="adm-login-subtitle">Espace réservé aux administrateurs MobilePay CI</div>
          <p className="adm-login-message">
            Pilotez la plateforme en toute sécurité : marchands, particuliers, transactions et
            providers de paiement, réunis en un seul tableau de bord.
          </p>
        </div>

        {/* Colonne droite — formulaire */}
        <div className="adm-login-right">
          <div className="adm-login-card-modern">
            <div className="adm-login-logo">
              <div className="adm-login-logo-mark">M</div>
            </div>
            <div className="adm-login-brand">
              Mobile<span>Pay</span>
            </div>

            <form onSubmit={handleSubmit} className="adm-login-form">
              <label className="adm-login-label">
                Numéro de téléphone
                <input
                  className="adm-input-modern"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+225 07 00 00 00 00"
                  autoFocus
                />
              </label>
              <label className="adm-login-label">
                Mot de passe
                <input
                  className="adm-input-modern"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
              {error && <div className="adm-login-error">{error}</div>}
              <button className="adm-login-btn" disabled={submitting} type="submit">
                {submitting ? <span className="adm-login-spinner" /> : 'Se connecter'}
              </button>
            </form>

            <p className="adm-login-footer">AXONE S.A</p>
          </div>
        </div>
      </div>

      {/* Transition de succès */}
      {success && (
        <div className="adm-login-success-overlay">
          <div className="adm-login-success-check">✓</div>
          <div className="adm-login-success-text">Succès ! Vous êtes connecté !</div>
        </div>
      )}
    </div>
  );
}
