import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'ORZAYAH — Payer',
  description: 'Page de paiement ORZAYAH',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
