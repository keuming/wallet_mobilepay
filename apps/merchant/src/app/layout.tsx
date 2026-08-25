import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import './globals.css';

export const metadata = {
  title: 'MobilePay CI — Dashboard Marchand',
  description: 'Dashboard marchand MobilePay CI',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
