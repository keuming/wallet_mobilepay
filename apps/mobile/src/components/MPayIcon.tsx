import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * Icône de marque ORZAYAH — le monogramme « OR ».
 *
 * § Remplace le badge « M-Pay » qui était dessiné en composants natifs faute
 * de fichier officiel. Le vrai logo étant désormais disponible, on l'utilise :
 * une marque doit être reproduite à l'identique partout, pas approximée.
 *
 * Le monogramme « OR » est la signature iconographique d'ORZAYAH : il est
 * extrait du logotype complet, jamais redessiné séparément.
 */
export default function MPayIcon({
  size = 26,
  style,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require('../../assets/adaptive-icon.png')}
      style={[{ width: size, height: size, borderRadius: size * 0.24 }, style]}
      resizeMode="contain"
    />
  );
}
