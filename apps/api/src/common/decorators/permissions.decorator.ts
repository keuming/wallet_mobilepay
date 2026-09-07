import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'adminPermissions';

/**
 * Exige une ou plusieurs permissions back-office sur un endpoint.
 * Utilisé avec PermissionsGuard. Un super-admin passe toujours.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
