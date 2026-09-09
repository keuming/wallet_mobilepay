/**
 * Pays couverts par HUB2 (§ zones UEMOA + CEMAC) avec leur indicatif
 * téléphonique — utilisé pour la saisie de numéro à la connexion et à
 * l'inscription, afin que l'utilisateur n'ait jamais à taper le "+"
 * lui-même : il sélectionne son pays, l'indicatif est ajouté automatiquement.
 */
export const HUB2_COUNTRIES: { code: string; name: string; dialCode: string }[] = [
  { code: 'CI', name: "Côte d'Ivoire", dialCode: '225' },
  { code: 'SN', name: 'Sénégal', dialCode: '221' },
  { code: 'ML', name: 'Mali', dialCode: '223' },
  { code: 'BF', name: 'Burkina Faso', dialCode: '226' },
  { code: 'BJ', name: 'Bénin', dialCode: '229' },
  { code: 'TG', name: 'Togo', dialCode: '228' },
  { code: 'NE', name: 'Niger', dialCode: '227' },
  { code: 'GW', name: 'Guinée-Bissau', dialCode: '245' },
  { code: 'CM', name: 'Cameroun', dialCode: '237' },
  { code: 'GA', name: 'Gabon', dialCode: '241' },
  { code: 'CG', name: 'Congo', dialCode: '242' },
  { code: 'TD', name: 'Tchad', dialCode: '235' },
  { code: 'CF', name: 'République Centrafricaine', dialCode: '236' },
  { code: 'GQ', name: 'Guinée Équatoriale', dialCode: '240' },
];
