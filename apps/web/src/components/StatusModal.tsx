'use client';

import { ReactNode, useEffect, useState } from 'react';

export type ResultStatus = 'success' | 'failed' | 'pending' | 'unknown';

const CONFIG: Record<ResultStatus, { icon: string; defaultTitle: string }> = {
  success: { icon: '✓', defaultTitle: 'Succès' },
  failed: { icon: '!', defaultTitle: "Ça n'a pas fonctionné" },
  pending: { icon: '⏳', defaultTitle: 'Opération en attente' },
  unknown: { icon: '⚠️', defaultTitle: 'Statut inconnu' },
};

// § Couleurs des confettis — dominante verte de marque, quelques éclats
// complémentaires pour un rendu festif sans dénaturer l'identité visuelle.
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

interface StatusModalProps {
  status: ResultStatus;
  title?: string;
  message: string;
  onClose: () => void;
  actions?: ReactNode; // boutons personnalisés ; sinon un bouton "Fermer" par défaut
}

/**
 * Modal de résultat de transaction, à utiliser après toute opération financière
 * (Envoyer, Payer, Recharger, Airtime...). Quatre états distincts :
 * - success (vert)  : le serveur confirme SUCCESS — célébration animée
 *   (confettis + coche qui se dessine) puisque c'est LE moment agréable de
 *   chaque parcours, sur toutes les transactions de l'app.
 * - failed (rouge)   : le serveur confirme FAILED/CANCELLED/EXPIRED
 * - pending (jaune)  : le serveur confirme PENDING/PROCESSING (ex: décaissement
 *   Mobile Money externe en attente de confirmation HUB2)
 * - unknown (orange) : aucune réponse exploitable reçue (coupure réseau, timeout,
 *   erreur avant que le serveur ait pu traiter la requête) — distinct d'un échec
 *   confirmé, car l'issue réelle de la transaction n'est pas connue.
 */
export default function StatusModal({ status, title, message, onClose, actions }: StatusModalProps) {
  const cfg = CONFIG[status];
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (status !== 'success') return;
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 1100);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <div className="mp-result-overlay" onClick={onClose}>
      <div className={`mp-result-card ${status === 'success' ? 'is-success' : ''}`} onClick={(e) => e.stopPropagation()}>
        {status === 'success' ? (
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
          <div className={`mp-result-icon ${status}`}>{cfg.icon}</div>
        )}
        <div className={`mp-result-title ${status}`}>
          {title ?? cfg.defaultTitle}
          {status === 'success' && <span style={{ marginLeft: 6 }}>🎉</span>}
        </div>
        <div className="mp-result-message">{message}</div>
        <div className="mp-result-actions">
          {actions ?? (
            <button className="mp-btn-primary" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
