import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme';

/**
 * Badge de marque MobilePay « M-Pay ».
 *
 * § Dessiné en composants natifs plutôt qu'importé comme image : un fichier
 * PNG dépend du registre d'assets de Metro, qui exige un redémarrage complet
 * du bundler à chaque ajout — source de confusion et d'affichage manquant.
 * Ici, aucun asset : le badge s'affiche immédiatement, reste net à toutes
 * les résolutions, et pèse quelques octets.
 *
 * L'identité reprend exactement celle du favicon de pay.mobilepay-ci.com :
 * fond marine, texte en vert de marque, coins arrondis.
 */
export default function MPayIcon({
  size = 26,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.24,
          backgroundColor: colors.navy,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.accent,
          fontWeight: '900',
          // Proportion calée sur le favicon pour un rendu identique.
          fontSize: size * 0.34,
          letterSpacing: -0.3,
          includeFontPadding: false,
        }}
        numberOfLines={1}
      >
        M-Pay
      </Text>
    </View>
  );
}
