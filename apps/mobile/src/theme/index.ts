/**
 * Système de design MobilePay — équivalent natif de globals.css.
 *
 * En React Native, le CSS n'existe pas : tout passe par des objets JS.
 * Ce fichier centralise les valeurs de marque pour qu'un changement (ex:
 * le vert) se répercute partout, exactement comme le faisaient les
 * variables CSS côté web.
 */

export const colors = {
  // Vert de marque officiel (identique au web)
  accent: '#00D27A',
  accentDark: '#00b368',
  accentSoft: 'rgba(0, 210, 122, 0.12)',

  // Marine (en-têtes, fonds sombres)
  navy: '#0f2d52',
  navyDark: '#0a1f3d',

  // Texte
  textPrimary: '#0b1f12',
  textSecondary: '#5a7a72',
  textOnAccent: '#ffffff',
  textOnDark: '#ffffff',

  // Surfaces
  bg: '#f7fbf8',
  surface: '#ffffff',
  border: '#e2e8e5',

  // États
  success: '#00b854',
  error: '#ef5c5c',
  warning: '#ff9900',
  pending: '#f59e0b',

  // Or (Épargne Gold)
  gold: '#d4a017',
  goldLight: '#f7d774',
} as const;

export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28, xxl: 40 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const fontSize = { xs: 11.5, sm: 13, md: 14.5, lg: 17, xl: 22, xxl: 28 } as const;

/** Ombre portée cohérente entre iOS et Android (APIs différentes). */
export const shadow = {
  card: {
    shadowColor: '#0b1f12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  raised: {
    shadowColor: '#0b1f12',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;
