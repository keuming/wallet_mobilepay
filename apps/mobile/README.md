# MobilePay CI — Application mobile native (Expo / React Native)

Fondations de l'app native particulier. Le **backend n'est pas modifié** :
cette app consomme exactement la même API que les apps web.

## Démarrage

```bash
cd apps/mobile
npm install
npx expo start
```

## Générer l'APK

```bash
npm install -g eas-cli
eas login
eas build:configure     # renseigne extra.eas.projectId dans app.json
npm run build:apk       # APK de test (installable directement)
npm run build:prod      # AAB pour le Play Store
```

## Ce qui est déjà en place

| Élément | Fichier |
|---|---|
| Système de design (couleurs, espacements, ombres) | `src/theme/index.ts` |
| Stockage chiffré des jetons (Keychain/Keystore) | `src/lib/secureStorage.ts` |
| Client API (idempotence, refresh, erreurs réseau) | `src/lib/apiClient.ts` |
| Authentification + flux OTP | `src/contexts/AuthContext.tsx` |
| Composants de base (Button, Input, Card…) | `src/components/ui.tsx` |
| Navigation | `app/_layout.tsx`, `app/index.tsx` |
| **Écran de référence** | `app/login.tsx` |

## Porter un écran depuis le web — équivalences

| Web | Natif |
|---|---|
| `<div>` | `<View>` |
| `<p>`, `<span>`, texte brut | `<Text>` (obligatoire pour TOUT texte) |
| `<button onClick>` | `<Pressable onPress>` |
| `<input onChange={e => e.target.value}>` | `<TextInput onChangeText={v => …}>` |
| `<a href>` / `<Link>` | `router.push()` (expo-router) |
| `className="..."` | `style={styles.x}` (StyleSheet) |
| défilement implicite | `<ScrollView>` explicite |
| `localStorage` | `secureStorage` (asynchrone) |

## Règles à respecter

1. **Tout texte dans `<Text>`** — une chaîne nue plante l'app en natif.
2. **Route financière = `idempotent: true`** — sinon l'API refuse la requête
   (protection anti-double-débit).
3. **`SafeAreaView` + `KeyboardAvoidingView` + `ScrollView`** sur chaque écran
   de formulaire (voir `login.tsx`).
4. **Pas de `%`, `vh`, `vw`** — utiliser `flex`, `Dimensions`, ou des valeurs fixes.
5. La logique métier du web (`groupLedgerEntries.ts`, `hub2Countries.ts`,
   `worldCountries.ts`) est **copiable telle quelle** — c'est du TypeScript pur.

## Écrans restants à porter (21)

Priorité 1 : `dashboard`, `envoyer`, `payer`, `recharger`, `historique`
Priorité 2 : `recevoir`, `profil`, `code-secret`, `inscription`
Priorité 3 : `cartes-cadeaux`, `factures`, `collecte`, `epargne`, `carte`,
`categories-depenses`, `releve-depenses`, `deplafonnement`, `cgu`,
`confidentialite`, `types-collecte`, `types-epargne`
