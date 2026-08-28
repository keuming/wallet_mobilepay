# Logos des moyens de paiement

Déposez ici les fichiers logo officiels (fournis par votre agrégateur sous
licence) avec **exactement** ces noms de fichiers — l'app les charge
automatiquement dès qu'ils sont présents, sans autre modification de code :

| Fichier attendu       | Moyen de paiement |
|------------------------|--------------------|
| `orange-money.png`     | Orange Money       |
| `moov-money.png`       | Moov Money         |
| `wave.png`              | Wave               |
| `mtn-money.png`         | MTN Money          |
| `visa.png`               | Visa               |
| `mastercard.png`         | Mastercard         |
| `mobilepay.png`          | MobilePay (votre propre logo) |

Format recommandé : PNG carré, fond transparent, au moins 128×128px.

Tant qu'un fichier n'est pas présent, un badge coloré de repli s'affiche
automatiquement à sa place (voir `src/components/PaymentMethodBadge.tsx`) —
aucune erreur, aucun blocage, l'app reste utilisable en attendant les assets.
