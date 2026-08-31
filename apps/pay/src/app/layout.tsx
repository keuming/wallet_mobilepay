import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'MobilePay CI — Payer',
  description: 'Page de paiement MobilePay CI',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
