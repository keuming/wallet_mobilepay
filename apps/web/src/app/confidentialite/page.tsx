import Link from 'next/link';

export const metadata = {
  title: 'Politique de confidentialité — MobilePay CI',
  description: "Politique de confidentialité de MobilePay CI, édité par la Compagnie des Services Numériques (CSN).",
};

const S = { marginBottom: 22 } as const;
const H = { fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--fz-text-primary)' } as const;
const P = { fontSize: 14, lineHeight: 1.6, color: 'var(--fz-text-secondary)', margin: '0 0 8px' } as const;
const LI = { fontSize: 14, lineHeight: 1.6, color: 'var(--fz-text-secondary)', marginBottom: 6 } as const;

export default function ConfidentialitePage() {
  return (
    <div className="mp-container" style={{ maxWidth: 640 }}>
      <div className="mp-page-header">
        <Link href="/dashboard" className="mp-back-link">← Retour</Link>
        <h1>🔒 Politique de confidentialité</h1>
      </div>

      <div className="mp-section" style={{ paddingTop: 0 }}>
        <p style={{ ...P, fontStyle: 'italic', marginBottom: 24 }}>
          Dernière mise à jour : 3 septembre 2026
        </p>

        <div style={S}>
          <h2 style={H}>1. Qui sommes-nous</h2>
          <p style={P}>
            MobilePay CI est édité par la <strong>Compagnie des Services Numériques (CSN)</strong>,
            dont le siège est situé à Cocody Riviera 2, Immeuble Paul, en face du Groupe Scolaire
            André Malraux, Abidjan, Côte d'Ivoire. La présente politique décrit quelles données
            personnelles nous collectons lorsque vous utilisez l'application MobilePay CI (wallet
            particulier et application marchand Business), pourquoi nous les collectons, et les
            droits dont vous disposez à leur sujet.
          </p>
        </div>

        <div style={S}>
          <h2 style={H}>2. Données que nous collectons</h2>
          <p style={P}>Nous collectons les catégories de données suivantes :</p>
          <ul style={{ paddingLeft: 20 }}>
            <li style={LI}><strong>Identité et compte</strong> — nom, prénom, numéro de téléphone, adresse email (facultative), pays de résidence, mot de passe (chiffré) et code secret de transaction (chiffré).</li>
            <li style={LI}><strong>Vérification d'identité (KYC)</strong> — photos recto/verso de votre pièce d'identité, photo selfie de vérification, et localisation GPS au moment de la soumission, lorsque vous demandez un relèvement de plafond.</li>
            <li style={LI}><strong>Transactions</strong> — historique de vos dépôts, retraits, transferts, paiements marchands, achats de crédit/data, cartes cadeaux et factures, avec montants, dates et destinataires.</li>
            <li style={LI}><strong>Carte virtuelle</strong> — informations liées à votre carte virtuelle MobilePay (numéro masqué, date d'expiration, solde), jamais le numéro complet ni le code de sécurité.</li>
            <li style={LI}><strong>Données techniques</strong> — type d'appareil, version de l'application, et journaux techniques nécessaires au bon fonctionnement et à la sécurité du service.</li>
          </ul>
        </div>

        <div style={S}>
          <h2 style={H}>3. Pourquoi nous utilisons ces données</h2>
          <ul style={{ paddingLeft: 20 }}>
            <li style={LI}>Créer et sécuriser votre compte, vous authentifier lors de la connexion.</li>
            <li style={LI}>Exécuter les opérations que vous demandez (dépôt, transfert, paiement, achat de crédit/data, carte cadeau, facture).</li>
            <li style={LI}>Vérifier votre identité conformément aux obligations réglementaires applicables aux services financiers en Côte d'Ivoire et dans la zone UEMOA/CEMAC.</li>
            <li style={LI}>Prévenir la fraude, le blanchiment de capitaux et les usages non autorisés du service.</li>
            <li style={LI}>Vous contacter au sujet de votre compte ou d'une transaction (SMS, notification).</li>
            <li style={LI}>Améliorer la fiabilité et la sécurité de l'application.</li>
          </ul>
        </div>

        <div style={S}>
          <h2 style={H}>4. Partage avec des tiers</h2>
          <p style={P}>
            Nous ne vendons jamais vos données personnelles. Certaines données sont partagées,
            uniquement dans la mesure nécessaire à l'exécution de vos opérations, avec :
          </p>
          <ul style={{ paddingLeft: 20 }}>
            <li style={LI}><strong>HUB2</strong> — agrégateur de paiement Mobile Money, pour le traitement des dépôts et retraits via Orange Money, MTN Mobile Money, Moov Money et Wave.</li>
            <li style={LI}><strong>Reloadly</strong> — fournisseur de crédit téléphonique, forfaits data, cartes cadeaux et paiement de factures.</li>
            <li style={LI}>Notre prestataire d'envoi de SMS, pour les codes de vérification et notifications de transaction.</li>
            <li style={LI}>Les autorités compétentes, lorsque la loi nous y oblige.</li>
          </ul>
        </div>

        <div style={S}>
          <h2 style={H}>5. Sécurité de vos données</h2>
          <p style={P}>
            Vos mots de passe et codes secrets sont chiffrés et ne sont jamais stockés en clair.
            Les communications entre l'application et nos serveurs sont chiffrées (HTTPS). L'accès
            à vos données personnelles au sein de notre équipe est limité aux personnes qui en ont
            besoin pour exercer leurs fonctions.
          </p>
        </div>

        <div style={S}>
          <h2 style={H}>6. Conservation des données</h2>
          <p style={P}>
            Nous conservons vos données aussi longtemps que votre compte est actif, et pendant la
            durée requise par nos obligations légales et réglementaires après sa fermeture
            (notamment en matière de lutte contre le blanchiment de capitaux).
          </p>
        </div>

        <div style={S}>
          <h2 style={H}>7. Vos droits</h2>
          <p style={P}>
            Vous pouvez à tout moment demander à consulter, corriger ou supprimer vos données
            personnelles, dans la limite de nos obligations légales de conservation. Pour exercer
            ces droits, contactez-nous aux coordonnées indiquées ci-dessous.
          </p>
        </div>

        <div style={S}>
          <h2 style={H}>8. Confidentialité des mineurs</h2>
          <p style={P}>
            MobilePay CI est réservé aux personnes majeures capables de contracter. Nous ne
            collectons pas sciemment de données auprès de mineurs.
          </p>
        </div>

        <div style={S}>
          <h2 style={H}>9. Modifications de cette politique</h2>
          <p style={P}>
            Nous pouvons modifier cette politique de confidentialité. Toute modification
            substantielle vous sera communiquée via l'application avant son entrée en vigueur.
          </p>
        </div>

        <div style={S}>
          <h2 style={H}>10. Nous contacter</h2>
          <p style={P}>
            Compagnie des Services Numériques (CSN)<br />
            Cocody Riviera 2, Immeuble Paul<br />
            En face du Groupe Scolaire André Malraux, Abidjan, Côte d'Ivoire
          </p>
        </div>
      </div>
    </div>
  );
}
