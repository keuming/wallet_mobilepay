import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import './globals.css';

export const metadata = {
  title: 'MobilePay CI',
  description: 'Wallet Particulier — MobilePay CI',
  manifest: '/manifest.json',
  themeColor: '#0a8f58',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* § Chargement fiable des polices — remplace l'ancien @import CSS
            (bloquant, lent), cause probable du texte perçu comme "trop
            fin" quand la police de secours du téléphone s'affichait le
            temps que Google Fonts charge, notamment sur connexion lente. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
