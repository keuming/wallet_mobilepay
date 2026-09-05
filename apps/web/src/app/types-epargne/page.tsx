'use client';

import PotTypesManager from '../../components/PotTypesManager';

export default function TypesEpargnePage() {
  return (
    <PotTypesManager
      kind="epargne"
      title="🥇 Types d'épargne"
      description="Crée tes propres épargnes (Retraite, Études, Urgence...) pour mettre de l'argent de côté sur le long terme, séparément de ton solde principal."
      apiBase="/savings/types"
      actionHref="/epargne"
    />
  );
}
