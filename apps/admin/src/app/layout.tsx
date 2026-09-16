import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import './globals.css';

export const metadata = {
  title: 'ORZAYAH — Back-office',
  description: 'Back-office administrateur ORZAYAH',
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
