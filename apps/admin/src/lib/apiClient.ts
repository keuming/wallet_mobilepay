const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_admin_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_admin_refresh_token');
}

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('mp_admin_access_token', accessToken);
  localStorage.setItem('mp_admin_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('mp_admin_access_token');
  localStorage.removeItem('mp_admin_refresh_token');
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
  const { auth = true, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    };
    if (auth) {
      const token = getAccessToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }
    return fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
  };

  let response = await doFetch();

  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch();
    } else {
      clearTokens();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
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
