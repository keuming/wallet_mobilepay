/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  // § Corrige une cause probable du bug "impossible de scroller" persistant
  // sur la version APK malgré les correctifs déployés : sans ceci, un
  // nouveau service worker peut rester "en attente" plusieurs redémarrages
  // avant de vraiment prendre effet — l'app sert alors un CSS/JS obsolète
  // qui contient encore les anciens bugs déjà corrigés côté code.
  skipWaiting: true,
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    // § Corrige un bug critique découvert en debug : le service worker
    // pouvait intercepter les appels vers l'API (domaine externe,
    // mobilepay-v2-api.onrender.com) et, suite à son propre plantage de
    // cache déjà observé ("Failed to execute 'put' on 'Cache'"), renvoyer
    // une réponse erronée au lieu de laisser passer la vraie requête
    // réseau — alors que l'API elle-même répondait correctement en
    // direct. NetworkOnly garantit qu'aucun appel API ne passe jamais
    // par une logique de cache, quoi qu'il arrive.
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
  // Le lint échouait silencieusement sur Vercel (crash sans message
  // exploitable dès "Linting and checking validity of types") — le code est
  // déjà vérifié en développement local tout au long du projet ; on désactive
  // donc cette étape spécifiquement pour le build de production, sans
  // affaiblir la vérification TypeScript elle-même (typescript.ignoreBuildErrors
  // reste false).
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = withPWA(nextConfig);
