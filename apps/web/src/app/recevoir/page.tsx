'use client';

import Link from 'next/link';

export default function EncaisserHubPage() {
  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>💰 Dépôt</h1>
      </div>

      <div className="mp-feature-list">
        <Link href="/recevoir/wallet" className="mp-feature-card featured">
          <div className="mp-feature-icon">💰</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Alimenter mon wallet</div>
            <div className="mp-feature-sub">Depuis Mobile Money ou carte bancaire</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
        <Link href="/recevoir/personne" className="mp-feature-card">
          <div className="mp-feature-icon">📲</div>
          <div className="mp-feature-text">
            <div className="mp-feature-title">Recevoir d'une personne</div>
            <div className="mp-feature-sub">QR code ou lien de demande de paiement</div>
          </div>
          <div className="mp-feature-chevron">→</div>
        </Link>
      </div>
    </div>
  );
}
