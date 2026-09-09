import * as SecureStore from 'expo-secure-store';

/**
 * Stockage des jetons d'authentification.
 *
 * § Différence CRITIQUE avec le web : `localStorage` n'existe pas en
 * natif, et surtout il ne serait pas acceptable ici. expo-secure-store
 * chiffre les données via le Keychain (iOS) et le Keystore (Android) —
 * un jeton d'accès à un compte financier ne doit jamais être stocké en
 * clair sur l'appareil.
 *
 * Contrainte à connaître : ces API sont ASYNCHRONES (contrairement à
 * localStorage qui est synchrone), d'où les `await` partout.
 */

const ACCESS_KEY = 'mp_access_token';
const REFRESH_KEY = 'mp_refresh_token';

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_KEY);
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
}
