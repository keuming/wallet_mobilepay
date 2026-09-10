import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * Icône de marque MobilePay (badge « M-Pay »).
 *
 * § Remplace le cœur vert 💚 utilisé jusqu'ici : un emoji n'est pas une
 * marque, il s'affiche différemment selon l'appareil et ne dit rien de
 * MobilePay. Ce badge reprend exactement l'identité du favicon de
 * pay.mobilepay-ci.com — même fond marine, même vert de marque.
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
      source={require('../../assets/mpay-icon.png')}
      style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]}
      resizeMode="contain"
    />
  );
}
