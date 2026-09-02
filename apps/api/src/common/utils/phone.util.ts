import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

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
