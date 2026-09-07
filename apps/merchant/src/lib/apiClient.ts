const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface RequestOptions extends RequestInit {
  auth?: boolean;
  idempotent?: boolean;
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_merchant_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_merchant_refresh_token');
}

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('mp_merchant_access_token', accessToken);
  localStorage.setItem('mp_merchant_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('mp_merchant_access_token');
  localStorage.removeItem('mp_merchant_refresh_token');
  localStorage.removeItem('mp_merchant_id');
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
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

  // § La clé était régénérée à chaque tentative (y compris au rejeu après
  // refresh du jeton), ce qui annulait la protection anti-double-débit.
  const idempotencyKey = idempotent ? generateIdempotencyKey() : null;

  const doFetch = async (): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    };
    if (auth) {
      const token = getAccessToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }
    if (idempotencyKey) finalHeaders['Idempotency-Key'] = idempotencyKey;
    try {
      return await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
    } catch {
      // § Coupure réseau (fréquente en mobilité) — message clair au lieu
      // d'un `TypeError: Failed to fetch` brut remonté jusqu'à l'écran.
      throw new ApiError('Connexion impossible. Vérifie ta connexion internet et réessaie.', 0);
    }
  };

  let response = await doFetch();

  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch();
    } else {
      clearTokens();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        // § BOUCLE DE REDIRECTION CORRIGÉE (cause du clignotement continu
        // en production) : une session expirée SUR la page /login relançait
        // /login -> /users/me -> 401 -> /login... en boucle, chaque cycle
        // étant un rechargement complet de page.
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
      throw new ApiError('Session expirée.', 401);
    }
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(json?.error?.message ?? 'Une erreur est survenue.', response.status);
  }

  return json.data as T;
}
