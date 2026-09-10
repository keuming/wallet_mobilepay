import { NativeModules, Platform } from 'react-native';

/**
 * Détermine le pays d'utilisation de l'appareil.
 *
 * § MobilePay opère à l'international : le pays par défaut ne doit pas être
 * figé sur la Côte d'Ivoire. Un utilisateur au Sénégal ou en France doit
 * trouver son pays déjà sélectionné, la recherche ne servant qu'aux cas où
 * il achète un service POUR un autre pays.
 *
 * Aucune dépendance ajoutée : on lit la configuration régionale du système,
 * disponible nativement. Trois sources sont tentées dans l'ordre, car
 * aucune n'est garantie sur tous les appareils.
 */
export function getDeviceCountry(): string | null {
  // 1. API standard Intl — présente avec Hermes sur les versions récentes.
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale; // ex: "fr-CI"
    const region = locale?.split('-')[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    // Intl indisponible sur cet appareil — on tente la suite.
  }

  // 2. Réglages système natifs.
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const locale: string | undefined =
        settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      const region = locale?.split(/[-_]/)[1];
      if (region && region.length === 2) return region.toUpperCase();
    } else {
      const locale: string | undefined = NativeModules.I18nManager?.localeIdentifier;
      const region = locale?.split(/[-_]/)[1];
      if (region && region.length === 2) return region.toUpperCase();
    }
  } catch {
    // Module natif absent — on renonce proprement.
  }

  // 3. Aucune information fiable : l'appelant décidera du repli (généralement
  //    le pays enregistré sur le compte).
  return null;
}

/**
 * Pays par défaut à proposer.
 *
 * § L'ordre de priorité compte, et l'expérience l'a démontré : la
 * configuration régionale d'un appareil est peu fiable (SIM en itinérance,
 * langue système, téléphone acheté à l'étranger) — un compte ouvert en Côte
 * d'Ivoire se voyait proposer le Bénin.
 *
 * Le pays ENREGISTRÉ SUR LE COMPTE fait donc foi : c'est la résidence
 * déclarée par le titulaire, celle qui fonde son KYC et ses plafonds. La
 * détection appareil ne sert que de repli quand le compte n'en porte pas.
 *
 * `allowed` restreint au périmètre réellement couvert par le fournisseur
 * concerné — inutile de pré-sélectionner un pays où le service échouerait.
 */
export function resolveDefaultCountry(
  profileCountry?: string | null,
  allowed?: { code: string }[],
): string {
  const isAllowed = (code: string | null | undefined): code is string =>
    !!code && (!allowed || allowed.some((c) => c.code === code));

  // 1. Pays de résidence déclaré sur le compte — la source de vérité.
  if (isAllowed(profileCountry)) return profileCountry;

  // 2. À défaut seulement, ce que suggère l'appareil.
  const device = getDeviceCountry();
  if (isAllowed(device)) return device;

  // 3. Repli sûr.
  return allowed?.[0]?.code ?? 'CI';
}
