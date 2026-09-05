'use client';

import PotTypesManager from '../../components/PotTypesManager';

export default function TypesCollectePage() {
  return (
    <PotTypesManager
      kind="collecte"
      title="🗃️ Types de collecte"
      description="Crée tes propres collectes (Voyage, Mariage, Projet...) pour mettre de l'argent de côté séparément de ton solde principal, sans jamais le perdre de vue."
      apiBase="/collecte/types"
      actionHref="/collecte"
    />
  );
}
