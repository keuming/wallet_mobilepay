'use client';

import { ReactNode } from 'react';

export type ResultStatus = 'success' | 'failed' | 'pending' | 'unknown';

const CONFIG: Record<ResultStatus, { icon: string; defaultTitle: string }> = {
  success: { icon: '✓', defaultTitle: 'Opération réussie' },
  failed: { icon: '✕', defaultTitle: 'Échec de l\'opération' },
  pending: { icon: '⏳', defaultTitle: 'Opération en attente' },
  unknown: { icon: '⚠️', defaultTitle: 'Statut inconnu' },
};

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
 * - success (vert)  : le serveur confirme SUCCESS
 * - failed (rouge)   : le serveur confirme FAILED/CANCELLED/EXPIRED
 * - pending (jaune)  : le serveur confirme PENDING/PROCESSING (ex: décaissement
 *   Mobile Money externe en attente de confirmation HUB2)
 * - unknown (orange) : aucune réponse exploitable reçue (coupure réseau, timeout,
 *   erreur avant que le serveur ait pu traiter la requête) — distinct d'un échec
 *   confirmé, car l'issue réelle de la transaction n'est pas connue.
 */
export default function StatusModal({ status, title, message, onClose, actions }: StatusModalProps) {
  const cfg = CONFIG[status];

  return (
    <div className="mp-result-overlay" onClick={onClose}>
      <div className="mp-result-card" onClick={(e) => e.stopPropagation()}>
        <div className={`mp-result-icon ${status}`}>{cfg.icon}</div>
        <div className={`mp-result-title ${status}`}>{title ?? cfg.defaultTitle}</div>
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
