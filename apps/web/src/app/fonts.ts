import { Sora, Plus_Jakarta_Sans } from 'next/font/google';

/**
 * § Polices auto-hébergées via next/font (§ correction lenteur PWA) —
 * remplace l'ancien <link> Google Fonts externe, qui bloquait le rendu le
 * temps d'un aller-retour réseau supplémentaire avant que le texte
 * s'affiche, surtout pénalisant sur connexion lente. next/font télécharge
 * les fichiers de police au moment du build et les sert depuis notre
 * propre domaine — zéro requête externe au chargement, et mis en cache
 * par le service worker PWA comme le reste des assets.
 */
export const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});
