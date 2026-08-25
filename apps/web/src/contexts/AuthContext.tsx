'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, storeTokens, clearTokens } from '../lib/apiClient';

interface UserProfile {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  kycLevel: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const profile = await apiFetch<UserProfile>('/users/me');
      setUser(profile);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (phone: string, password: string) => {
    const result = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ phone, password }),
    });
    storeTokens(result.accessToken, result.refreshToken);
    await refreshProfile();
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  return ctx;
}
