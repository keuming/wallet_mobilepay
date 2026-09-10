import PotsScreen from '../src/components/PotsScreen';
import { colors } from '../src/theme';

export default function CollecteScreen() {
  return (
    <PotsScreen
      title="🗃️ Collecte"
      basePath="/collecte/types"
      accent={colors.accent}
      createLabel="+ Créer un pot de collecte"
      emptyHint={
        "Aucun pot pour l'instant.\nCrée-en un pour mettre de l'argent de côté par projet."
      }
    />
  );
}
