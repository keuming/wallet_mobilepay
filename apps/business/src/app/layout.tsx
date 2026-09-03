import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { sora, jakarta } from './fonts';
import './globals.css';

export const metadata = {
  title: 'MobilePay Business — Encaissement',
  description: 'Application mobile marchand MobilePay CI — encaissement client',
  manifest: '/manifest.json',
  themeColor: '#47b686',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${sora.variable} ${jakarta.variable}`}>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
