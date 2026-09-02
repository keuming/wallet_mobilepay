'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, storeTokens, clearTokens } from '../lib/apiClient';

interface MerchantUserProfile {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface MyMerchant {
  merchantId: string;
  role: string;
  businessName: string;
  status: string;
  transfersEnabled: boolean;
  country: string;
}

interface AuthContextValue {
  user: MerchantUserProfile | null;
  merchants: MyMerchant[];
  activeMerchant: MyMerchant | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveMerchantId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MerchantUserProfile | null>(null);
  const [merchants, setMerchants] = useState<MyMerchant[]>([]);
  const [activeMerchantId, setActiveMerchantIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setActiveMerchantId = (id: string) => {
    setActiveMerchantIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem('mp_merchant_id', id);
  };

  const bootstrap = async () => {
    try {
      const profile = await apiFetch<MerchantUserProfile>('/users/me');
      setUser(profile);
      const mine = await apiFetch<MyMerchant[]>('/merchants/mine');
      setMerchants(mine);

      const stored = typeof window !== 'undefined' ? localStorage.getItem('mp_merchant_id') : null;
      const valid = mine.find((m) => m.merchantId === stored);
      if (valid) {
        setActiveMerchantIdState(valid.merchantId);
      } else if (mine.length > 0) {
        setActiveMerchantId(mine[0].merchantId);
      }
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    bootstrap().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (phone: string, password: string) => {
    const result = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ phone, password }),
    });
    storeTokens(result.accessToken, result.refreshToken);
    await bootstrap();
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearTokens();
    setUser(null);
    setMerchants([]);
    setActiveMerchantIdState(null);
  };

  const activeMerchant = merchants.find((m) => m.merchantId === activeMerchantId) ?? null;

  return (
    <AuthContext.Provider
      value={{ user, merchants, activeMerchant, loading, login, logout, setActiveMerchantId }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  return ctx;
}
