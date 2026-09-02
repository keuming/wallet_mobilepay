import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

/** Pays couverts par HUB2 (zones UEMOA + CEMAC) — source canonique, réutilisée pour la validation et la normalisation. */
export const SUPPORTED_COUNTRIES: CountryCode[] = ['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];

/**
 * Normalise un numéro de téléphone (local ou international) vers le format
 * E.164 complet, tel que stocké en base sur User.phone.
 *
 * § Correction multi-pays : le paramètre `defaultCountry` sert d'indice
 * UNIQUEMENT quand le numéro est saisi sans "+" explicite (format local).
 * Un numéro avec "+" (ex: +221771234567) est toujours interprété
 * correctement quel que soit ce paramètre — libphonenumber-js lit le vrai
 * indicatif dans le numéro lui-même. Le défaut 'CI' ne sert que de repli
 * pour les appels historiques qui ne connaissent pas encore le pays réel
 * (connexion, recherche) — partout où le pays de l'utilisateur est connu
 * (inscription, création de compte), il doit être transmis explicitement.
 */
export function normalizePhoneCI(phone: string, defaultCountry: CountryCode = 'CI'): string {
  try {
    return parsePhoneNumber(phone, defaultCountry).number;
  } catch {
    return phone;
  }
}

/**
 * § Recherche de compte existant sans connaître le pays à l'avance (connexion,
 * recherche admin) — un numéro saisi avec "+" est non-ambigu (un seul
 * candidat). Un numéro en format LOCAL (sans "+") est ambigu entre plusieurs
 * pays ; on génère un candidat par pays supporté, à essayer un par un contre
 * la base jusqu'à trouver une correspondance, plutôt que de supposer 'CI'
 * par défaut et échouer silencieusement pour les autres pays.
 */
export function normalizePhoneCandidates(phone: string): string[] {
  if (phone.trim().startsWith('+')) {
    return [normalizePhoneCI(phone)];
  }
  const candidates = new Set<string>();
  for (const country of SUPPORTED_COUNTRIES) {
    const normalized = normalizePhoneCI(phone, country);
    if (normalized && normalized !== phone) candidates.add(normalized);
  }
  return Array.from(candidates);
}
