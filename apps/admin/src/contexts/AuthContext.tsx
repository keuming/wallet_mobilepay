'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, storeTokens, clearTokens, ApiError } from '../lib/apiClient';

interface AdminProfile {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthContextValue {
  admin: AdminProfile | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ requiresOtp: boolean; maskedPhone: string }>;
  verifyLoginOtp: (phone: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const profile = await apiFetch<AdminProfile>('/users/me');
      if (profile.role !== 'ADMIN') {
        // Un compte non-admin ne doit jamais accéder au back-office —
        // on coupe la session immédiatement plutôt que d'afficher l'UI.
        clearTokens();
        setAdmin(null);
        return;
      }
      setAdmin(profile);
    } catch {
      setAdmin(null);
    }
  };

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // § Étape 1 : mot de passe vérifié côté serveur, qui envoie alors un code
  // de connexion par SMS (§ sécurité — revérifie le téléphone à CHAQUE
  // reconnexion, pas seulement le mot de passe) — aucun jeton encore émis ici.
  const login = async (phone: string, password: string) => {
    return apiFetch<{ requiresOtp: boolean; maskedPhone: string }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ phone, password }),
    });
  };

  // § Étape 2 : confirme le code reçu par SMS, émet les jetons, puis
  // vérifie que ce compte a bien le rôle ADMIN avant d'accorder l'accès.
  const verifyLoginOtp = async (phone: string, password: string, code: string) => {
    const result = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/login/verify-otp', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ phone, password, code }),
    });
    storeTokens(result.accessToken, result.refreshToken);
    const profile = await apiFetch<AdminProfile>('/users/me').catch(() => null);
    if (!profile || profile.role !== 'ADMIN') {
      clearTokens();
      setAdmin(null);
      throw new ApiError("Ce compte n'a pas les droits administrateur.", 403);
    }
    setAdmin(profile);
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearTokens();
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, loading, login, verifyLoginOtp, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  return ctx;
}
