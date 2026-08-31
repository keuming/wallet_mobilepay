import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Normalise un numéro de téléphone ivoirien (local ou international) vers
 * le format E.164 complet (+225...), tel que stocké en base sur User.phone.
 * Sans cette normalisation, une recherche par numéro échoue silencieusement
 * dès que l'utilisateur saisit le format local (ex: "0700000001" au lieu de
 * "+2250700000001"), même si ce compte existe bel et bien.
 * Retourne le numéro tel quel si le format est invalide — laisse la
 * validation en amont (class-validator @IsPhoneNumber) gérer le rejet.
 */
export function normalizePhoneCI(phone: string): string {
  try {
    return parsePhoneNumber(phone, 'CI').number;
  } catch {
    return phone;
  }
}
