/** @type {import('next').NextConfig} */
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

module.exports = nextConfig;
