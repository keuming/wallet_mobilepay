'use client';

import Link from 'next/link';

export default function CguPage() {
  return (
    <div className="mp-container">
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">
          ← Retour
        </Link>
        <h1>📄 Conditions générales</h1>
      </div>

      <div className="mp-static-content">
        <p style={{ fontSize: 12, color: 'var(--mp-muted)' }}>
          Version provisoire — document à faire valider par un juriste avant mise en production.
        </p>

        <h3>1. Objet</h3>
        <p>
          Les présentes conditions générales régissent l'utilisation de MobilePay CI, service de
          porte-monnaie électronique édité par Compagnie des Services Numériques (CSN), permettant
          l'envoi, la réception et le paiement de fonds via téléphone mobile en Côte d'Ivoire.
        </p>

        <h3>2. Ouverture de compte</h3>
        <p>
          L'ouverture d'un compte MobilePay est soumise à la vérification de l'identité de
          l'utilisateur (KYC). Les plafonds de transaction varient selon le niveau de vérification
          atteint.
        </p>

        <h3>3. Sécurité du compte</h3>
        <p>
          L'utilisateur est seul responsable de la confidentialité de ses identifiants de connexion
          et de son code secret transactionnel. MobilePay ne demande jamais ce code par téléphone,
          SMS ou email.
        </p>

        <h3>4. Frais</h3>
        <p>
          Les frais applicables aux transactions (envoi, paiement marchand, retrait) sont affichés
          avant validation de chaque opération et peuvent varier selon le type de transaction.
        </p>

        <h3>5. Litiges et remboursements</h3>
        <p>
          Toute contestation de transaction doit être signalée via l'assistance MobilePay dans les
          meilleurs délais. Les remboursements, lorsqu'applicables, sont traités conformément à la
          réglementation en vigueur.
        </p>

        <h3>6. Modification des conditions</h3>
        <p>
          MobilePay se réserve le droit de modifier les présentes conditions générales. Les
          utilisateurs seront informés de tout changement significatif via l'application.
        </p>

        <h3>7. Contact</h3>
        <p>
          Pour toute question, contactez notre service client via le menu "Parler à un agent" de
          l'application.
        </p>
      </div>
    </div>
  );
}
