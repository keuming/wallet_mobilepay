# MobilePay CI — MVP (dossier de développement)

Scaffold de production pour le MVP décrit dans le *Cahier des charges fonctionnel
et technique — MVP* (CSN / NEXOVA, version révisée 2, 24 août 2026).

Ce dépôt n'est pas une maquette : le backend est **fonctionnel** (auth, wallets,
transferts P2P, ledger en partie double, QR, payment links, adaptateur HUB2,
webhooks) et peut tourner en local avec Docker dès aujourd'hui. Les modules hors
périmètre du MVP strict (Stripe, PayPal, Reloadly, back-office admin complet,
app agent) sont **scaffoldés avec des interfaces stables** pour être complétés
sans casser l'existant — voir "Ce qui est stubé" plus bas.

---

## 1. Architecture du système

```
                         ┌─────────────────────┐
                         │   Clients            │
                         │  Web (Next.js)        │
                         │  Mobile (Flutter*)     │
                         └──────────┬───────────┘
                                    │ HTTPS / REST + JWT
                                    ▼
                         ┌─────────────────────┐
                         │   API Gateway         │
                         │   NestJS (apps/api)   │
                         │  - Auth (JWT+refresh) │
                         │  - RBAC guards        │
                         │  - Rate limiting       │
                         │  - Idempotency         │
                         └──────────┬───────────┘
                                    │
        ┌───────────────┬──────────┼───────────┬────────────────┐
        ▼               ▼          ▼           ▼                ▼
   Auth/Users        Wallets   Merchants   Payment Engine    QR/Links
   Module             Module    Module       Module           Module
        │               │          │           │                │
        └───────┬───────┴────┬─────┘           │                │
                 ▼            ▼                 ▼                │
            PostgreSQL    Ledger Engine    Provider Adapters      │
            (Prisma)      (partie double)  ┌─────┬────────┬────┐ │
                                            │HUB2 │Stripe* │... │ │
                                            └──┬──┴────────┴────┘ │
                                               │ webhooks (HMAC)   │
                                               ▼                   │
                                        Webhooks Module ───────────┘
                                               │
                                               ▼
                                        Redis (queues, cache, rate-limit)

  * = stubé / interface prête, implémentation à compléter en Phase 6
```

**Principes de conception qui permettent de monter à l'échelle :**

- **Séparation stricte lecture/écriture financière** : toute écriture de solde
  passe par `LedgerService.postDoubleEntry()`, jamais par un `UPDATE` direct sur
  `wallet.cachedBalance`. Le solde caché est recalculé dans la même transaction
  DB (`SERIALIZABLE`) que l'écriture du ledger → cohérence garantie même sous
  forte concurrence.
- **Idempotence obligatoire** sur toute route qui déplace de l'argent
  (`Idempotency-Key` en header, contrainte unique en base) → sûr à rejouer par
  un client mobile avec une connexion instable.
- **Modules découplés** : chaque domaine (`wallets`, `merchants`, `payment-engine`,
  `qr`...) est un module NestJS indépendant avec sa propre interface publique.
  Le Payment Engine ne connaît que l'interface `PaymentProviderAdapter` — ajouter
  Stripe ou PayPal ne touche à aucun autre module.
- **Stateless API** : aucun état en mémoire process — tout est en DB/Redis. Le
  service `apps/api` peut donc être répliqué horizontalement dès le jour 1
  (scaling = ajouter des instances derrière un load balancer, pas de refonte).
- **Queue-ready** : les traitements longs (webhooks, notifications, calcul de
  commissions) sont conçus pour être déplacés vers BullMQ/Redis sans changer
  la logique métier (voir `WebhooksService`, prêt pour `@Process()`).

---

## 2. Structure des fichiers

```
mobilepay-mvp/
├── docker-compose.yml           # Postgres + Redis pour le dev local
├── apps/
│   ├── api/                     # Backend NestJS
│   │   ├── prisma/
│   │   │   └── schema.prisma    # Schéma de données complet (voir docs/DATABASE.md)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/           # Config typée (env validation avec Zod)
│   │   │   ├── common/
│   │   │   │   ├── guards/       # JwtAuthGuard, RolesGuard, MerchantScopeGuard
│   │   │   │   ├── decorators/   # @CurrentUser, @Roles, @Idempotent
│   │   │   │   ├── filters/      # Filtre d'exceptions global (format d'erreur uniforme)
│   │   │   │   ├── interceptors/ # Logging, transform de réponse
│   │   │   │   └── middleware/   # Idempotency middleware
│   │   │   └── modules/
│   │   │       ├── auth/         # register, login, refresh, MFA (stub)
│   │   │       ├── users/        # profil particulier
│   │   │       ├── wallets/      # solde, historique, transferts P2P
│   │   │       ├── ledger/       # moteur comptable partie double (interne)
│   │   │       ├── merchants/    # création marchand, dashboard, MerchantUsers
│   │   │       ├── transactions/ # recherche/filtre transversal
│   │   │       ├── qr/           # QR particulier, marchand, dynamique, payment links
│   │   │       ├── payment-engine/
│   │   │       │   └── providers/hub2.adapter.ts   # implémentation HUB2
│   │   │       │   └── providers/provider.interface.ts
│   │   │       ├── webhooks/     # réception + vérification signature HMAC
│   │   │       ├── kyc/          # dossiers KYC (stub d'upload + revue)
│   │   │       ├── agents/       # (stub) gestion agents/QR pré-imprimés
│   │   │       └── notifications/ # (stub) SMS/push
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                      # Frontend Next.js — Wallet Particulier
│   │   └── src/
│   │       ├── app/               # App Router (login, dashboard, envoyer, recevoir)
│   │       ├── components/
│   │       ├── contexts/          # AuthContext
│   │       └── lib/               # apiClient (fetch + refresh transparent)
│   └── admin/                    # Frontend Next.js — Back-office administrateur (port 3002)
│       └── src/
│           ├── app/               # login, dashboard, marchands (liste+détail), utilisateurs, agents, transactions
│           ├── components/        # AdminShell (sidebar + topbar communs)
│           ├── contexts/          # AuthContext (vérifie le rôle ADMIN)
│           └── lib/               # apiClient
└── docs/
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    └── API.md
```

## 3. Démarrage local

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d              # Postgres + Redis
cd apps/api
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev                 # API sur http://localhost:3000

# Dans un autre terminal :
cd apps/web
npm install
npm run dev                       # Web sur http://localhost:3001

# Dans un troisième terminal — back-office admin :
cd apps/admin
npm install
npm run dev                       # Admin sur http://localhost:3002
```

## 4. Ce qui est implémenté vs stubé

| Module | État | Détail |
|---|---|---|
| Auth (register/login/refresh) | ✅ Implémenté | JWT + refresh token rotatif, bcrypt |
| Wallet particulier (solde, historique) | ✅ Implémenté | |
| Transfert P2P | ✅ Implémenté | Transaction `SERIALIZABLE`, idempotence, ledger double entrée |
| Wallet marchand | ✅ Implémenté | Solde disponible/en attente séparés |
| Ledger financier | ✅ Implémenté | Append-only, `balanceAfter` pour audit |
| QR marchand statique + dynamique | ✅ Implémenté | Génération + résolution |
| Payment Link | ✅ Implémenté | CRUD + résolution publique |
| Paiement marchand (encaissement) | ✅ Implémenté | Débite le payeur, crédite le marchand net de frais |
| Adaptateur HUB2 (top-up / cash-out) | ✅ Implémenté (sandbox) | Signature HMAC sortante + entrante |
| Webhooks entrants | ✅ Implémenté | Vérification HMAC, idempotence par `providerRef` |
| RBAC (particulier/marchand/agent/admin) | ✅ Implémenté | Guards + `MerchantScopeGuard` pour l'isolation multi-tenant |
| Back-office admin (dashboard, marchands, utilisateurs, agents, transactions) | ✅ Implémenté | App Next.js dédiée (`apps/admin`) — dashboard §17, revue KYC + activation marchand, blocage particulier, suspension agent, recherche transactions §22 |
| KYC | 🟡 Stub | Modèle de données + endpoints CRUD ; pas d'OCR/vérification automatique — la revue se fait manuellement depuis le back-office admin |
| Agents & QR pré-imprimés (lots) | 🟡 Stub | Modèle + génération de lot ; app agent mobile à construire (Phase 4) |
| Stripe / PayPal / Reloadly | 🟡 Stub | Interface `PaymentProviderAdapter` prête, implémentation à écrire (Phase 6) |
| Back-office admin (toutes les vues) | 🟡 Partiel | Dashboard, marchands, particuliers, agents, transactions faits ; gestion QR/lots, réconciliation, KYC en masse restent à construire en UI (endpoints API déjà prêts) |
| Notifications SMS/push | 🟡 Stub | Écriture en DB ; envoi réel à brancher sur un provider SMS local |
| Web marchand / agent | ⬜ Non démarré | Wallet particulier (apps/web) et back-office admin (apps/admin) scaffoldés ; dashboard marchand et app agent restent à construire (Phase 3+/4) |

## 5. Sécurité déjà en place

- Mots de passe hashés avec `bcrypt` (12 rounds)
- JWT access token courte durée (15 min) + refresh token rotatif stocké hashé en DB
- Toutes les routes financières exigent `Idempotency-Key`
- Webhooks vérifiés par signature HMAC-SHA256 avant tout traitement
- `class-validator` sur tous les DTO d'entrée (whitelist + forbidNonWhitelisted)
- Isolation multi-tenant : `MerchantScopeGuard` vérifie que l'utilisateur connecté
  appartient bien au `merchantId` de la ressource demandée
- Rate limiting global via `@nestjs/throttler`
- Aucune donnée sensible dans un QR (référence opaque uniquement, conforme §13)

## 6. Prochaines étapes suggérées

1. Brancher un vrai compte sandbox HUB2 (remplacer les credentials `.env.example`)
2. Écrire les tests d'intégration sur `WalletsService.transfer()` (le point le
   plus critique du système — concurrence + idempotence)
3. Construire le dashboard marchand (Next.js) en réutilisant `apiClient`
4. Ajouter BullMQ pour déplacer le traitement des webhooks hors du thread HTTP
5. Documentation API REST complète (OpenAPI — `@nestjs/swagger` est déjà
   installé, il ne reste qu'à annoter les DTO)
