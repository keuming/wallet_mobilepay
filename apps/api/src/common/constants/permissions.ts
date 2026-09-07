/**
 * Permissions granulaires du back-office (§ administration d'équipe).
 *
 * Avant : tout compte ADMIN avait accès à TOUT — créer des utilisateurs,
 * approvisionner manuellement des comptes, changer la tarification, débloquer
 * des marchands. Pour une équipe (support, comptabilité, direction), c'est un
 * risque réel : une erreur ou un compte compromis donnait les pleins pouvoirs
 * financiers.
 *
 * Chaque permission correspond à un domaine métier, pas à un endpoint isolé —
 * plus simple à attribuer et à comprendre pour la personne qui gère l'équipe.
 */
export const ADMIN_PERMISSIONS = {
  // Consultation
  DASHBOARD_VIEW: 'dashboard:view',
  TRANSACTIONS_VIEW: 'transactions:view',

  // Utilisateurs & comptes
  USERS_VIEW: 'users:view',
  USERS_MANAGE: 'users:manage', // créer, modifier, bloquer
  USERS_CREDENTIALS: 'users:credentials', // réinitialiser mot de passe / code secret

  // Marchands & agents
  MERCHANTS_VIEW: 'merchants:view',
  MERCHANTS_MANAGE: 'merchants:manage',
  AGENTS_MANAGE: 'agents:manage',

  // Opérations financières sensibles
  FUNDING_MANAGE: 'funding:manage', // approvisionnement manuel, alimentation cartes
  PRICING_MANAGE: 'pricing:manage', // grille tarifaire

  // Technique
  QR_MANAGE: 'qr:manage',
  PROVIDERS_VIEW: 'providers:view',

  // Administration des accès eux-mêmes (à réserver à très peu de personnes)
  ADMIN_TEAM_MANAGE: 'admin:team',
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export const ALL_ADMIN_PERMISSIONS: string[] = Object.values(ADMIN_PERMISSIONS);

/**
 * Profils prédéfinis — évitent de cocher les permissions une par une et
 * limitent les erreurs d'attribution. Restent modifiables au cas par cas.
 */
export const ADMIN_ROLE_PRESETS: Record<string, { label: string; permissions: string[] }> = {
  SUPPORT: {
    label: 'Support client',
    permissions: [
      ADMIN_PERMISSIONS.DASHBOARD_VIEW,
      ADMIN_PERMISSIONS.TRANSACTIONS_VIEW,
      ADMIN_PERMISSIONS.USERS_VIEW,
      ADMIN_PERMISSIONS.USERS_CREDENTIALS,
      ADMIN_PERMISSIONS.MERCHANTS_VIEW,
    ],
  },
  OPERATIONS: {
    label: 'Opérations',
    permissions: [
      ADMIN_PERMISSIONS.DASHBOARD_VIEW,
      ADMIN_PERMISSIONS.TRANSACTIONS_VIEW,
      ADMIN_PERMISSIONS.USERS_VIEW,
      ADMIN_PERMISSIONS.USERS_MANAGE,
      ADMIN_PERMISSIONS.MERCHANTS_VIEW,
      ADMIN_PERMISSIONS.MERCHANTS_MANAGE,
      ADMIN_PERMISSIONS.AGENTS_MANAGE,
      ADMIN_PERMISSIONS.QR_MANAGE,
    ],
  },
  FINANCE: {
    label: 'Finance / Comptabilité',
    permissions: [
      ADMIN_PERMISSIONS.DASHBOARD_VIEW,
      ADMIN_PERMISSIONS.TRANSACTIONS_VIEW,
      ADMIN_PERMISSIONS.FUNDING_MANAGE,
      ADMIN_PERMISSIONS.PRICING_MANAGE,
      ADMIN_PERMISSIONS.PROVIDERS_VIEW,
    ],
  },
  READ_ONLY: {
    label: 'Consultation seule',
    permissions: [
      ADMIN_PERMISSIONS.DASHBOARD_VIEW,
      ADMIN_PERMISSIONS.TRANSACTIONS_VIEW,
      ADMIN_PERMISSIONS.USERS_VIEW,
      ADMIN_PERMISSIONS.MERCHANTS_VIEW,
      ADMIN_PERMISSIONS.PROVIDERS_VIEW,
    ],
  },
};
