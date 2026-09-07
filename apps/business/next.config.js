/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // § CAUSE DU CLIGNOTEMENT CORRIGÉE : `reloadOnOnline` recharge la page à
  // CHAQUE retour de connexion. Sur un réseau mobile instable (typique en
  // usage réel), le navigateur bascule sans cesse entre en ligne et hors
  // ligne — provoquant des rechargements en boucle, donc un écran qui
  // clignote sans fin. L'app fonctionne très bien sans : les requêtes
  // échouées affichent maintenant un message clair (voir apiClient).
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
  skipWaiting: true,
  workboxOptions: {
    disableDevLogs: true,
    // skipWaiting/clientsClaim retirés — voir explication ci-dessus.
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.href.includes('onrender.com/api'),
        handler: 'NetworkOnly',
      },
    ],
  },
});

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  },
};

module.exports = withPWA(nextConfig);
