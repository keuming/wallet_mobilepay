'use client';

import EnterpriseServicePage from '../../components/EnterpriseServicePage';

export default function CollectePage() {
  return (
    <EnterpriseServicePage
      serviceType="COLLECTE"
      title="Collecte"
      icon="📥"
      description="Marchands utilisant MobilePay pour l'encaissement de masse pour le compte d'un tiers (frais scolaires, factures, cotisations...)."
    />
  );
}
