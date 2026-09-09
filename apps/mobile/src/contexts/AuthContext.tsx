import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { apiFetch, setSessionExpiredHandler } from '../lib/apiClient';
import { storeTokens, clearTokens, getAccessToken } from '../lib/secureStorage';

export interface UserProfile {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  kycLevel: string;
  country: string;
  profilePhotoBase64?: string | null;
}

interface LoginResult {
  requiresOtp: boolean;
  maskedPhone?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (phone: string, password: string, country?: string) => Promise<LoginResult>;
  verifyLoginOtp: (phone: string, password: string, code: string, country?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await apiFetch<UserProfile>('/users/me');
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  // § Session perdue : on navigue proprement via le routeur au lieu de
  // recharger la page (impossible en natif, et c'était justement la cause
  // du clignotement côté web).
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      await refreshProfile();
      setLoading(false);
    })();
  }, [refreshProfile]);

  /** Étape 1 — mot de passe vérifié, l'API envoie le code SMS. */
  const login = async (phone: string, password: string, country = 'CI') => {
    return apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ phone, password, country }),
    });
  };

  /** Étape 2 — confirme le code SMS et ouvre la session. */
  const verifyLoginOtp = async (phone: string, password: string, code: string, country = 'CI') => {
    const result = await apiFetch<{ accessToken: string; refreshToken: string }>(
      '/auth/login/verify-otp',
      {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ phone, password, code, country }),
      },
    );
    await storeTokens(result.accessToken, result.refreshToken);
    await refreshProfile();
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    await clearTokens();
    setUser(null);
    router.replace('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLoginOtp, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
