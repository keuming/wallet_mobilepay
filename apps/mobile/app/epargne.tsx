import PotsScreen from '../src/components/PotsScreen';
import { colors } from '../src/theme';

export default function EpargneScreen() {
  return (
    <PotsScreen
      title="🥇 Épargne Gold"
      basePath="/savings/types"
      accent={colors.gold}
      createLabel="+ Créer un compte d'épargne"
      emptyHint={
        "Aucun compte d'épargne pour l'instant.\nCrée-en un pour faire fructifier ton argent."
      }
    />
  );
}
