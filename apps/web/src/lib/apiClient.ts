const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface RequestOptions extends RequestInit {
  auth?: boolean; // ajoute automatiquement le Bearer token (défaut: true)
  idempotent?: boolean; // ajoute automatiquement un Idempotency-Key (défaut: false)
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_refresh_token');
}

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('mp_access_token', accessToken);
  localStorage.setItem('mp_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('mp_access_token');
  localStorage.removeItem('mp_refresh_token');
}

// Génère une clé d'idempotence côté client — indispensable sur mobile/2G où une
// requête peut timeout côté client alors qu'elle a réussi côté serveur : rejouer
// avec la même clé ne débite jamais deux fois (voir IdempotencyMiddleware côté API).
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // Coalesce les refresh concurrents : si 3 requêtes échouent en 401 en même
  // temps, on ne fait qu'un seul appel /auth/refresh, pas trois.
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;

      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;

      const json = await res.json();
      storeTokens(json.data.accessToken, json.data.refreshToken);
      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, idempotent = false, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    };

    if (auth) {
      const token = getAccessToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }
    if (idempotent) {
      finalHeaders['Idempotency-Key'] = generateIdempotencyKey();
    }

    return fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
  };

  let response = await doFetch();

  // Sur un 401 (access token expiré), on tente un refresh unique puis on rejoue
  // la requête une seule fois — pas de boucle infinie si le refresh échoue aussi.
  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch();
    } else {
      clearTokens();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new ApiError('Session expirée.', 401);
    }
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(json?.error?.message ?? 'Une erreur est survenue.', response.status);
  }

  return json.data as T;
}
