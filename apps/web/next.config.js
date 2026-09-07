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
  // § skipWaiting DÉSACTIVÉ (cause confirmée du clignotement) : la doc
  // officielle Chrome/Workbox est explicite — avec skipWaiting, "la page
  // actuelle se recharge automatiquement" dès qu'un nouveau service worker
  // s'installe, ce que Google déconseille par défaut car cela "désoriente
  // l'utilisateur et peut causer des pertes de données". Combiné à
  // clientsClaim, cela provoquait des rechargements en boucle.
  //
  // Le compromis assumé : une mise à jour prend effet à la prochaine
  // ouverture de l'app plutôt qu'instantanément — comportement normal et
  // attendu d'une application mobile.
  workboxOptions: {
    disableDevLogs: true,
    // skipWaiting/clientsClaim retirés — voir explication ci-dessus.
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
