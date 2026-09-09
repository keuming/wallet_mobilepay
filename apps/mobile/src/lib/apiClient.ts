import Constants from 'expo-constants';
import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './secureStorage';

const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string) ??
  'https://mobilepay-v2-api.onrender.com/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  /** Ajoute un Idempotency-Key — OBLIGATOIRE sur toute route financière. */
  idempotent?: boolean;
}

/**
 * Clé d'idempotence : protège contre le double débit si la requête est
 * rejouée (réseau instable, renouvellement de jeton, double appui).
 * § Générée UNE SEULE FOIS par requête logique — la régénérer à chaque
 * tentative annulerait toute la protection (bug réel corrigé côté web).
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Empêche plusieurs renouvellements simultanés si 3 requêtes échouent ensemble. */
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;

      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;

      const json = await res.json();
      const data = json?.data ?? json;
      if (!data?.accessToken || !data?.refreshToken) return false;

      await storeTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Callback déclenché quand la session est définitivement perdue.
 * § En natif il n'y a pas de `window.location` : la navigation est gérée
 * par l'app elle-même (voir AuthContext), ce qui évite au passage la
 * boucle de redirection qui faisait clignoter la version web.
 */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export async function apiFetch<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, idempotent = false, headers, ...rest } = options;

  const idempotencyKey = idempotent ? generateIdempotencyKey() : null;

  const doFetch = async (): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    };

    if (auth) {
      const token = await getAccessToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }
    if (idempotencyKey) finalHeaders['Idempotency-Key'] = idempotencyKey;

    try {
      return await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
    } catch {
      // Réseau mobile instable = cas NORMAL en usage réel, pas une erreur
      // technique à afficher brute.
      throw new ApiError('Connexion impossible. Vérifie ta connexion internet et réessaie.', 0);
    }
  };

  let response = await doFetch();

  // Jeton expiré : un seul renouvellement, puis un seul rejeu.
  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch();
    } else {
      await clearTokens();
      onSessionExpired?.();
      throw new ApiError('Session expirée.', 401);
    }
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json?.error?.message ??
      json?.message ??
      "Une erreur est survenue. Réessaie dans quelques instants.";
    throw new ApiError(Array.isArray(message) ? message[0] : message, response.status);
  }

  // L'API enveloppe ses réponses dans { success, data } (ResponseInterceptor).
  return (json?.data ?? json) as T;
}
